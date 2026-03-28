/* ============================================================
   AquaVida - Admin Panel JavaScript
   Handles: auth, products CRUD, orders, categories, image upload
   ============================================================ */

'use strict';

// ---- State ----
let _sb;
let currentUser  = null;
let allAdminProducts  = [];
let allAdminOrders    = [];
let allAdminCategories= [];
let editingProductId  = null;
let editingCatId      = null;
let pendingDeleteFn   = null;
let uploadedImageUrl  = null;

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initLoginForm();
  checkSession();
});

function initSupabase() {
  try {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Error iniciando Supabase:', e);
    showLoginAlert('No se pudo conectar con Supabase. Verifica la configuración.');
  }
}

// ============================================================
//  AUTH
// ============================================================
async function checkSession() {
  if (!_sb) return;
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (session) {
      currentUser = session.user;
      enterAdminPanel();
    }
  } catch (e) { console.warn('Error verificando sesión:', e.message); }
}

function initLoginForm() {
  const form    = document.getElementById('loginForm');
  const togglePw= document.getElementById('togglePw');
  const pwInput = document.getElementById('loginPassword');

  form?.addEventListener('submit', handleLogin);
  togglePw?.addEventListener('click', () => {
    const isText = pwInput.type === 'text';
    pwInput.type = isText ? 'password' : 'text';
    togglePw.textContent = isText ? '👁' : '🙈';
  });
}

async function handleLogin(e) {
  e.preventDefault();
  if (!_sb) {
    showLoginAlert('Supabase no está configurado. Edita config.js con tus credenciales.');
    return;
  }

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginBtn');
  const btnText  = document.getElementById('loginBtnText');
  const spinner  = document.getElementById('loginSpinner');

  if (!email || !password) {
    showLoginAlert('Por favor ingresa correo y contraseña.');
    return;
  }

  btn.disabled = true;
  btnText.textContent = 'Iniciando sesión...';
  spinner?.classList.remove('hidden');

  try {
    const { data, error } = await _sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    enterAdminPanel();
  } catch (err) {
    showLoginAlert(
      err.message.includes('Invalid login')
        ? 'Correo o contraseña incorrectos.'
        : `Error: ${err.message}`
    );
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Iniciar sesión';
    spinner?.classList.add('hidden');
  }
}

async function handleLogout() {
  if (!_sb) return;
  await _sb.auth.signOut();
  currentUser = null;
  document.getElementById('adminPanel').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.body.className = 'login-page';
}

function showLoginAlert(msg) {
  const alert = document.getElementById('loginAlert');
  if (!alert) return;
  alert.textContent = msg;
  alert.classList.remove('hidden', 'success-alert');
}

// ============================================================
//  PANEL SETUP
// ============================================================
function enterAdminPanel() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('adminPanel').classList.remove('hidden');
  document.body.className = 'admin-body';

  // Set user email in sidebar
  const emailEl = document.getElementById('userEmail');
  if (emailEl && currentUser) emailEl.textContent = currentUser.email;

  initTabs();
  initSidebar();
  initProductForm();
  initCategoryForm();
  initOrderFilter();
  initConfirmDialog();
  initChangePassword();
  loadDashboard();

  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
}

// ============================================================
//  TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const tab = item.dataset.tab;
      switchTab(tab);
    });
  });

  // "Agregar producto" button in products tab
  document.querySelectorAll('[data-tab-link]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tabLink));
  });
}

function switchTab(tabName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.tab === tabName);
  });
  // Update content
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tabName}`);
  });

  // Update topbar title
  const titles = {
    dashboard: 'Dashboard',
    products: 'Productos',
    'add-product': 'Agregar Producto',
    orders: 'Pedidos / Apartados',
    categories: 'Categorías'
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[tabName] || tabName;

  // Load data for the tab
  if (tabName === 'products')    loadProducts();
  if (tabName === 'orders')      loadOrders();
  if (tabName === 'categories')  loadCategories();
  if (tabName === 'add-product') {
    if (!editingProductId) resetProductForm();
    loadCategoriesIntoSelect('prodCategoria');
  }
  if (tabName === 'dashboard')   loadDashboard();

  // Close mobile sidebar
  closeMobileSidebar();
}

// ============================================================
//  SIDEBAR MOBILE
// ============================================================
function initSidebar() {
  const toggleBtn = document.getElementById('sidebarToggle');
  const sidebar   = document.getElementById('sidebar');

  // Inject overlay if not present
  let overlay = document.getElementById('sidebarOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeMobileSidebar);
  }

  toggleBtn?.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', open);
  });
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
}

// ============================================================
//  DASHBOARD
// ============================================================
async function loadDashboard() {
  if (!_sb) return;
  try {
    const [productsRes, ordersRes, categoriesRes] = await Promise.all([
      _sb.from('productos').select('id, activo', { count: 'exact' }).eq('activo', true),
      _sb.from('pedidos').select('id, estado, cliente_nombre, cliente_telefono, cantidad, created_at, productos(nombre)', { count: 'exact' }).order('created_at', { ascending: false }).limit(5),
      _sb.from('categorias').select('id', { count: 'exact' }),
    ]);

    const pendingRes = await _sb.from('pedidos').select('id', { count: 'exact' }).eq('estado', 'pendiente');

    document.getElementById('statProducts').textContent   = productsRes.count ?? 0;
    document.getElementById('statOrders').textContent     = ordersRes.count ?? 0;
    document.getElementById('statCategories').textContent = categoriesRes.count ?? 0;
    document.getElementById('statPending').textContent    = pendingRes.count ?? 0;

    renderRecentOrders(ordersRes.data || []);
  } catch (e) { console.error('Error en dashboard:', e.message); }
}

function renderRecentOrders(orders) {
  const wrap = document.getElementById('recentOrdersWrap');
  if (!wrap) return;
  if (orders.length === 0) {
    wrap.innerHTML = '<p class="loading-row">Sin pedidos aún.</p>';
    return;
  }
  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Cliente</th><th>Producto</th><th>Cant.</th><th>Estado</th><th>Fecha</th></tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td>${escHtml(o.cliente_nombre)}</td>
            <td>${escHtml(o.productos?.nombre || '—')}</td>
            <td>${o.cantidad}</td>
            <td>${statusBadge(o.estado)}</td>
            <td>${formatDate(o.created_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================
//  PRODUCTS
// ============================================================
async function loadProducts() {
  if (!_sb) return;
  const tbody = document.getElementById('productsTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading-row">Cargando productos...</td></tr>';

  try {
    const { data, error } = await _sb
      .from('productos')
      .select('*, categorias(id, nombre)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    allAdminProducts = data || [];
    renderProductsTable(allAdminProducts);

    // Populate category filter
    const cats = [...new Map(data.map(p => [p.categorias?.id, p.categorias]).filter(([k]) => k)).values()];
    const filterSel = document.getElementById('categoryFilter');
    if (filterSel) {
      filterSel.innerHTML = '<option value="">Todas las categorías</option>' +
        cats.map(c => `<option value="${c.id}">${escHtml(c.nombre)}</option>`).join('');
    }
    initProductTableFilters();
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loading-row">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderProductsTable(products) {
  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading-row">No hay productos.</td></tr>';
    return;
  }

  tbody.innerHTML = products.map(p => {
    const catName = p.categorias?.nombre || '—';
    const imgHtml = p.imagen_url
      ? `<img src="${escHtml(p.imagen_url)}" class="table-img" alt="${escHtml(p.nombre)}" onerror="this.outerHTML='<div class=\\'table-img-placeholder\\'>🐠</div>'" />`
      : `<div class="table-img-placeholder">🐠</div>`;

    return `
      <tr data-product-id="${p.id}">
        <td>${imgHtml}</td>
        <td>
          <div class="product-name-cell">
            ${escHtml(p.nombre)}
            <small>${escHtml(p.descripcion?.slice(0, 60) || '')}${(p.descripcion?.length > 60) ? '…' : ''}</small>
          </div>
        </td>
        <td>${escHtml(catName)}</td>
        <td><strong>${formatPrice(p.precio)}</strong></td>
        <td>${p.activo
          ? '<span class="badge badge--active">✓ Activo</span>'
          : '<span class="badge badge--inactive">✗ Inactivo</span>'}</td>
        <td>
          <div class="action-btns">
            <button class="btn-icon btn-icon--edit" title="Editar" onclick="editProduct('${p.id}')">✏️</button>
            <button class="btn-icon btn-icon--delete" title="Eliminar" onclick="confirmDeleteProduct('${p.id}', '${escHtml(p.nombre)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function initProductTableFilters() {
  const searchInput = document.getElementById('productSearch');
  const catFilter   = document.getElementById('categoryFilter');

  const filter = () => {
    const q   = (searchInput?.value || '').toLowerCase();
    const cat = catFilter?.value || '';
    const filtered = allAdminProducts.filter(p =>
      (p.nombre.toLowerCase().includes(q) || (p.descripcion || '').toLowerCase().includes(q)) &&
      (!cat || String(p.categorias?.id) === cat)
    );
    renderProductsTable(filtered);
  };

  searchInput?.addEventListener('input', filter);
  catFilter?.addEventListener('change', filter);
}

// ---- Edit Product ----
function editProduct(id) {
  const product = allAdminProducts.find(p => String(p.id) === String(id));
  if (!product) return;

  editingProductId = id;
  uploadedImageUrl = product.imagen_url || null;

  // Update form title
  const titleEl = document.getElementById('productFormTitle');
  if (titleEl) titleEl.textContent = 'Editar Producto';

  // Fill form
  document.getElementById('editProductId').value   = product.id;
  document.getElementById('prodNombre').value       = product.nombre || '';
  document.getElementById('prodDescripcion').value  = product.descripcion || '';
  document.getElementById('prodPrecio').value       = product.precio || '';
  document.getElementById('prodActivo').value       = String(product.activo);
  document.getElementById('prodImagenUrl').value    = product.imagen_url || '';

  // Show image preview if available
  if (product.imagen_url) {
    const preview = document.getElementById('imagePreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const previewImg  = document.getElementById('previewImg');
    if (preview && placeholder && previewImg) {
      previewImg.src = product.imagen_url;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
    }
  }

  loadCategoriesIntoSelect('prodCategoria', product.categorias?.id);
  switchTab('add-product');
}

function resetProductForm() {
  editingProductId = null;
  uploadedImageUrl = null;
  const form = document.getElementById('productForm');
  form?.reset();
  document.getElementById('editProductId').value = '';
  document.getElementById('productFormTitle').textContent = 'Agregar Producto';
  document.getElementById('imagePreview')?.classList.add('hidden');
  document.getElementById('uploadPlaceholder')?.classList.remove('hidden');
  document.getElementById('productFormAlert')?.classList.add('hidden');
  document.getElementById('saveBtnText').textContent = 'Guardar producto';
}

// ---- Product Form ----
function initProductForm() {
  const form      = document.getElementById('productForm');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const fileInput = document.getElementById('prodImagen');
  const removeBtn = document.getElementById('removeImgBtn');

  form?.addEventListener('submit', handleSaveProduct);
  cancelBtn?.addEventListener('click', () => { resetProductForm(); switchTab('products'); });
  fileInput?.addEventListener('change', handleImageFileSelect);
  removeBtn?.addEventListener('click', removeSelectedImage);
}

function handleImageFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast('La imagen no debe superar 5 MB.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const preview = document.getElementById('imagePreview');
    const placeholder = document.getElementById('uploadPlaceholder');
    const previewImg  = document.getElementById('previewImg');
    if (previewImg) previewImg.src = ev.target.result;
    preview?.classList.remove('hidden');
    placeholder?.classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function removeSelectedImage() {
  const fileInput   = document.getElementById('prodImagen');
  const preview     = document.getElementById('imagePreview');
  const placeholder = document.getElementById('uploadPlaceholder');
  const previewImg  = document.getElementById('previewImg');
  const urlInput    = document.getElementById('prodImagenUrl');

  if (fileInput) fileInput.value = '';
  if (previewImg) previewImg.src = '';
  preview?.classList.add('hidden');
  placeholder?.classList.remove('hidden');
  if (urlInput) urlInput.value = '';
  uploadedImageUrl = null;
}

async function handleSaveProduct(e) {
  e.preventDefault();

  const nombre      = document.getElementById('prodNombre').value.trim();
  const descripcion = document.getElementById('prodDescripcion').value.trim();
  const precio      = parseFloat(document.getElementById('prodPrecio').value);
  const catId       = document.getElementById('prodCategoria').value;
  const activo      = document.getElementById('prodActivo').value === 'true';
  const urlInput    = document.getElementById('prodImagenUrl').value.trim();

  if (!nombre || isNaN(precio) || precio < 0 || !catId) {
    showFormAlert('productFormAlert', 'Completa todos los campos obligatorios.');
    return;
  }

  const saveBtn  = document.getElementById('saveProductBtn');
  const saveTxt  = document.getElementById('saveBtnText');
  const saveSpin = document.getElementById('saveSpinner');
  saveBtn.disabled = true;
  saveTxt.textContent = 'Guardando...';
  saveSpin?.classList.remove('hidden');

  try {
    // Upload image if file selected
    let imagen_url = uploadedImageUrl || urlInput || null;
    const fileInput = document.getElementById('prodImagen');
    if (fileInput?.files[0]) {
      const uploadedUrl = await uploadProductImage(fileInput.files[0]);
      if (uploadedUrl) imagen_url = uploadedUrl;
    }
    if (urlInput) imagen_url = urlInput;

    const productData = {
      nombre,
      descripcion: descripcion || null,
      precio,
      categoria_id: catId,
      activo,
      imagen_url
    };

    let error;
    if (editingProductId) {
      ({ error } = await _sb.from('productos').update(productData).eq('id', editingProductId));
    } else {
      ({ error } = await _sb.from('productos').insert([productData]));
    }
    if (error) throw error;

    showToast(editingProductId ? 'Producto actualizado.' : 'Producto agregado.', 'success');
    resetProductForm();
    switchTab('products');
  } catch (err) {
    showFormAlert('productFormAlert', `Error: ${err.message}`);
  } finally {
    saveBtn.disabled = false;
    saveTxt.textContent = editingProductId ? 'Actualizar producto' : 'Guardar producto';
    saveSpin?.classList.add('hidden');
  }
}

async function uploadProductImage(file) {
  if (!_sb) return null;
  try {
    const ext       = file.name.split('.').pop();
    const filename  = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await _sb.storage.from('productos').upload(filename, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (error) throw error;

    const { data } = _sb.storage.from('productos').getPublicUrl(filename);
    return data.publicUrl;
  } catch (e) {
    showToast(`Error al subir imagen: ${e.message}`, 'error');
    return null;
  }
}

// ---- Delete Product ----
function confirmDeleteProduct(id, nombre) {
  showConfirmDialog(
    '¿Eliminar producto?',
    `¿Estás seguro de eliminar "${nombre}"? Esta acción no se puede deshacer.`,
    () => deleteProduct(id)
  );
}

async function deleteProduct(id) {
  try {
    const { error } = await _sb.from('productos').delete().eq('id', id);
    if (error) throw error;
    showToast('Producto eliminado.', 'success');
    loadProducts();
    loadDashboard();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

// ============================================================
//  ORDERS
// ============================================================
async function loadOrders(statusFilter = '') {
  if (!_sb) return;
  const tbody = document.getElementById('ordersTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading-row">Cargando pedidos...</td></tr>';

  try {
    let query = _sb
      .from('pedidos')
      .select('*, productos(nombre, precio)')
      .order('created_at', { ascending: false });

    if (statusFilter) query = query.eq('estado', statusFilter);

    const { data, error } = await query;
    if (error) throw error;
    allAdminOrders = data || [];
    renderOrdersTable(allAdminOrders);
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No hay pedidos.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o, idx) => `
    <tr>
      <td><strong>#${String(idx + 1).padStart(3, '0')}</strong></td>
      <td>${escHtml(o.cliente_nombre)}</td>
      <td>
        <a href="https://wa.me/52${o.cliente_telefono}" target="_blank" style="color:var(--primary);font-weight:600;">
          ${escHtml(o.cliente_telefono)}
        </a>
      </td>
      <td>${escHtml(o.productos?.nombre || '—')}</td>
      <td>${o.cantidad}</td>
      <td>
        <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)">
          ${['pendiente','confirmado','entregado','cancelado'].map(s =>
            `<option value="${s}" ${o.estado === s ? 'selected' : ''}>${capitalize(s)}</option>`
          ).join('')}
        </select>
      </td>
      <td style="white-space:nowrap">${formatDate(o.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon btn-icon--wa" title="WhatsApp"
            onclick="window.open('https://wa.me/52${o.cliente_telefono}','_blank')">💬</button>
          <button class="btn-icon btn-icon--delete" title="Eliminar"
            onclick="confirmDeleteOrder('${o.id}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  if (!_sb) return;
  try {
    const { error } = await _sb.from('pedidos').update({ estado: newStatus }).eq('id', orderId);
    if (error) throw error;
    showToast(`Estado actualizado a: ${newStatus}`, 'success');
    loadDashboard();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

function confirmDeleteOrder(id) {
  showConfirmDialog('¿Eliminar pedido?', 'Esta acción no se puede deshacer.', () => deleteOrder(id));
}

async function deleteOrder(id) {
  try {
    const { error } = await _sb.from('pedidos').delete().eq('id', id);
    if (error) throw error;
    showToast('Pedido eliminado.', 'success');
    loadOrders();
    loadDashboard();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

function initOrderFilter() {
  document.getElementById('orderStatusFilter')?.addEventListener('change', e => {
    loadOrders(e.target.value);
  });
}

// ============================================================
//  CATEGORIES
// ============================================================
async function loadCategories() {
  if (!_sb) return;
  const tbody = document.getElementById('categoriesTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Cargando categorías...</td></tr>';

  try {
    // Load categories and count products per category
    const [catsRes, prodsRes] = await Promise.all([
      _sb.from('categorias').select('*').order('nombre'),
      _sb.from('productos').select('categoria_id')
    ]);

    if (catsRes.error) throw catsRes.error;
    allAdminCategories = catsRes.data || [];

    // Count products per category
    const countMap = {};
    (prodsRes.data || []).forEach(p => {
      countMap[p.categoria_id] = (countMap[p.categoria_id] || 0) + 1;
    });

    renderCategoriesTable(allAdminCategories, countMap);
  } catch (e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="loading-row">Error: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderCategoriesTable(categories, countMap = {}) {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody) return;

  if (categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Sin categorías aún.</td></tr>';
    return;
  }

  tbody.innerHTML = categories.map(c => `
    <tr>
      <td><strong>${escHtml(c.nombre)}</strong></td>
      <td>${escHtml(c.descripcion || '—')}</td>
      <td><span class="badge badge--active">${countMap[c.id] || 0} productos</span></td>
      <td>
        <div class="action-btns">
          <button class="btn-icon btn-icon--edit" title="Editar" onclick="editCategory('${c.id}')">✏️</button>
          <button class="btn-icon btn-icon--delete" title="Eliminar" onclick="confirmDeleteCategory('${c.id}', '${escHtml(c.nombre)}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function initCategoryForm() {
  const form      = document.getElementById('categoryForm');
  const cancelBtn = document.getElementById('cancelCatBtn');
  form?.addEventListener('submit', handleSaveCategory);
  cancelBtn?.addEventListener('click', resetCategoryForm);
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const nombre      = document.getElementById('catNombre').value.trim();
  const descripcion = document.getElementById('catDescripcion').value.trim();

  if (!nombre) {
    showFormAlert('catFormAlert', 'Ingresa el nombre de la categoría.');
    return;
  }

  try {
    const payload = { nombre, descripcion: descripcion || null };
    let error;
    if (editingCatId) {
      ({ error } = await _sb.from('categorias').update(payload).eq('id', editingCatId));
    } else {
      ({ error } = await _sb.from('categorias').insert([payload]));
    }
    if (error) throw error;

    showToast(editingCatId ? 'Categoría actualizada.' : 'Categoría agregada.', 'success');
    resetCategoryForm();
    loadCategories();
  } catch (err) {
    showFormAlert('catFormAlert', `Error: ${err.message}`);
  }
}

function editCategory(id) {
  const cat = allAdminCategories.find(c => String(c.id) === String(id));
  if (!cat) return;
  editingCatId = id;
  document.getElementById('editCatId').value      = cat.id;
  document.getElementById('catNombre').value      = cat.nombre;
  document.getElementById('catDescripcion').value = cat.descripcion || '';
  document.getElementById('catFormTitle').textContent = 'Editar Categoría';
  document.getElementById('catBtnText').textContent   = 'Actualizar';
  document.getElementById('cancelCatBtn')?.classList.remove('hidden');
}

function resetCategoryForm() {
  editingCatId = null;
  document.getElementById('categoryForm')?.reset();
  document.getElementById('editCatId').value = '';
  document.getElementById('catFormTitle').textContent = 'Nueva Categoría';
  document.getElementById('catBtnText').textContent   = 'Agregar categoría';
  document.getElementById('cancelCatBtn')?.classList.add('hidden');
  document.getElementById('catFormAlert')?.classList.add('hidden');
}

function confirmDeleteCategory(id, nombre) {
  showConfirmDialog(
    '¿Eliminar categoría?',
    `¿Eliminar "${nombre}"? Los productos en esta categoría quedarán sin categoría.`,
    () => deleteCategory(id)
  );
}

async function deleteCategory(id) {
  try {
    const { error } = await _sb.from('categorias').delete().eq('id', id);
    if (error) throw error;
    showToast('Categoría eliminada.', 'success');
    loadCategories();
  } catch (e) {
    showToast(`Error: ${e.message}`, 'error');
  }
}

// ============================================================
//  HELPERS: Categories in Select
// ============================================================
async function loadCategoriesIntoSelect(selectId, selectedId = null) {
  if (!_sb) return;
  try {
    const { data } = await _sb.from('categorias').select('*').order('nombre');
    const select   = document.getElementById(selectId);
    if (!select || !data) return;
    select.innerHTML = '<option value="">-- Selecciona categoría --</option>' +
      data.map(c =>
        `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${escHtml(c.nombre)}</option>`
      ).join('');
  } catch (e) { console.warn('Error cargando categorías en select:', e.message); }
}

// ============================================================
//  CONFIRM DIALOG
// ============================================================
function initConfirmDialog() {
  document.getElementById('dialogCancel')?.addEventListener('click',  closeConfirmDialog);
  document.getElementById('dialogConfirm')?.addEventListener('click', () => {
    if (typeof pendingDeleteFn === 'function') pendingDeleteFn();
    closeConfirmDialog();
  });
  document.getElementById('confirmDialog')?.addEventListener('click', e => {
    if (e.target === document.getElementById('confirmDialog')) closeConfirmDialog();
  });
}

function showConfirmDialog(title, message, onConfirm) {
  pendingDeleteFn = onConfirm;
  document.getElementById('dialogTitle').textContent   = title;
  document.getElementById('dialogMessage').textContent = message;
  document.getElementById('confirmDialog')?.classList.remove('hidden');
}
function closeConfirmDialog() {
  document.getElementById('confirmDialog')?.classList.add('hidden');
  pendingDeleteFn = null;
}

// ============================================================
//  UTILITIES
// ============================================================
function formatPrice(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function statusBadge(status) {
  const map = {
    pendiente: 'badge--pending',
    confirmado:'badge--confirmed',
    entregado: 'badge--delivered',
    cancelado: 'badge--cancelled'
  };
  const cls = map[status] || 'badge--inactive';
  return `<span class="badge ${cls}">${capitalize(status)}</span>`;
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

// ============================================================
//  CHANGE PASSWORD
// ============================================================
function initChangePassword() {
  const openBtn      = document.getElementById('changePasswordBtn');
  const dialog       = document.getElementById('changePasswordDialog');
  const cancelBtn    = document.getElementById('cancelChangePwBtn');
  const form         = document.getElementById('changePasswordForm');
  const newPwInput   = document.getElementById('newPassword');
  const confPwInput  = document.getElementById('confirmPassword');
  const toggleNewPw  = document.getElementById('toggleNewPw');
  const toggleConfPw = document.getElementById('toggleConfirmPw');

  toggleNewPw?.addEventListener('click', () => {
    const isText = newPwInput.type === 'text';
    newPwInput.type = isText ? 'password' : 'text';
    toggleNewPw.textContent = isText ? '👁' : '🙈';
  });

  toggleConfPw?.addEventListener('click', () => {
    const isText = confPwInput.type === 'text';
    confPwInput.type = isText ? 'password' : 'text';
    toggleConfPw.textContent = isText ? '👁' : '🙈';
  });

  openBtn?.addEventListener('click', () => {
    form.reset();
    const alertEl = document.getElementById('changePwAlert');
    alertEl.textContent = '';
    alertEl.className = 'form-alert hidden';
    dialog.classList.remove('hidden');
  });

  const closeDialog = () => dialog.classList.add('hidden');
  cancelBtn?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });

  form?.addEventListener('submit', handleChangePassword);
}

async function handleChangePassword(e) {
  e.preventDefault();
  const newPassword  = document.getElementById('newPassword').value;
  const confPassword = document.getElementById('confirmPassword').value;
  const alertEl      = document.getElementById('changePwAlert');
  const btn          = document.getElementById('changePwBtn');
  const btnText      = document.getElementById('changePwBtnText');
  const spinner      = document.getElementById('changePwSpinner');

  const showAlert = (msg, success = false) => {
    alertEl.textContent = msg;
    alertEl.className = `form-alert${success ? ' success' : ''}`;
  };

  if (newPassword.length < 8) {
    showAlert('La contraseña debe tener al menos 8 caracteres.');
    return;
  }
  if (newPassword !== confPassword) {
    showAlert('Las contraseñas no coinciden.');
    return;
  }

  btn.disabled = true;
  btnText.textContent = 'Guardando...';
  spinner.classList.remove('hidden');

  try {
    const { error } = await _sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
    showAlert('Contraseña actualizada correctamente.', true);
    showToast('Contraseña actualizada.');
    setTimeout(() => document.getElementById('changePasswordDialog').classList.add('hidden'), 1800);
  } catch (err) {
    showAlert(`Error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Guardar';
    spinner.classList.add('hidden');
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function showFormAlert(alertId, message) {
  const el = document.getElementById(alertId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden', 'success');
}

// Expose functions called from inline onclick handlers
window.editProduct            = editProduct;
window.confirmDeleteProduct   = confirmDeleteProduct;
window.updateOrderStatus      = updateOrderStatus;
window.confirmDeleteOrder     = confirmDeleteOrder;
window.editCategory           = editCategory;
window.confirmDeleteCategory  = confirmDeleteCategory;
