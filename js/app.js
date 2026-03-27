'use strict';

// ---- State ----
let sbClient;
let allProducts = [];
let currentCategory = 'all';
let selectedProduct = null;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  initHeader();
  initHamburger();
  initModal();
  initSearch();
  setCurrentYear();
  setWhatsAppInfo();
  loadCategoriesAndProducts();
});

// ============================================================
//  Supabase
// ============================================================
function initSupabase() {
  try {
    sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Error iniciando Supabase:', e);
    showToast('No se pudo conectar con el servidor.', 'error');
  }
}

// ============================================================
//  Load Data
// ============================================================
async function loadCategoriesAndProducts() {
  await Promise.all([loadCategories(), loadProducts()]);
}

async function loadCategories() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient
      .from('categorias')
      .select('*')
      .order('nombre');

    if (error) throw error;
    renderCategoryFilters(data || []);
    renderFooterCategories(data || []);
  } catch (e) {
    console.warn('Error cargando categorías:', e.message);
  }
}

async function loadProducts() {
  if (!sbClient) {
    renderProducts([]);
    return;
  }
  try {
    const { data, error } = await sbClient
      .from('productos')
      .select(`
        id,
        nombre,
        descripcion,
        precio,
        imagen_url,
        activo,
        categorias ( id, nombre )
      `)
      .eq('activo', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    allProducts = data || [];
    renderProducts(allProducts);
  } catch (e) {
    console.error('Error cargando productos:', e.message);
    showToast('Error al cargar productos. Verifica la conexión.', 'error');
    renderProducts([]);
  }
}

// ============================================================
//  Render: Category Filters
// ============================================================
function renderCategoryFilters(categories) {
  const container = document.getElementById('filterButtons');
  if (!container) return;

  // Keep the "Todos" button, remove old dynamic ones
  container.querySelectorAll('[data-dynamic]').forEach(el => el.remove());

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.category = cat.id;
    btn.dataset.dynamic = '1';
    btn.textContent = cat.nombre;
    btn.addEventListener('click', () => handleFilterClick(btn, cat.id));
    container.appendChild(btn);
  });

  // "Todos" button event
  const todosBtn = container.querySelector('[data-category="all"]');
  if (todosBtn) {
    todosBtn.addEventListener('click', () => handleFilterClick(todosBtn, 'all'));
  }
}

function handleFilterClick(btn, categoryValue) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentCategory = categoryValue;
  applyFilters();
}

// ============================================================
//  Render: Footer Categories
// ============================================================
function renderFooterCategories(categories) {
  const container = document.getElementById('footerCategories');
  if (!container || categories.length === 0) return;
  container.innerHTML = categories.map(cat => `
    <li><a href="#catalogo" data-cat-id="${cat.id}">${cat.nombre}</a></li>
  `).join('');
  container.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      const btn = document.querySelector(`.filter-btn[data-category="${link.dataset.catId}"]`);
      if (btn) btn.click();
    });
  });
}

// ============================================================
//  Render: Products
// ============================================================
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  const emptyState = document.getElementById('emptyState');
  if (!grid) return;

  // Clear skeletons & previous content
  grid.innerHTML = '';

  if (products.length === 0) {
    emptyState && emptyState.classList.remove('hidden');
    return;
  }

  emptyState && emptyState.classList.add('hidden');

  const limit = parseInt(grid.dataset.limit, 10);
  if (limit > 0) products = products.slice(0, limit);

  products.forEach((product, idx) => {
    const card = createProductCard(product, idx);
    grid.appendChild(card);
  });
}

function createProductCard(product, idx) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.style.animationDelay = `${idx * 60}ms`;

  const categoryName = product.categorias?.nombre || 'General';
  const emoji = getCategoryEmoji(categoryName);
  const priceFormatted = formatPrice(product.precio);

  const imgHtml = product.imagen_url
    ? `<img src="${escHtml(product.imagen_url)}" alt="${escHtml(product.nombre)}" class="product-card__img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'product-card__placeholder\\'>${emoji}</div>'" />`
    : `<div class="product-card__placeholder">${emoji}</div>`;

  card.innerHTML = `
    <div class="product-card__img-wrap">
      ${imgHtml}
      <span class="product-card__badge">${escHtml(categoryName)}</span>
    </div>
    <div class="product-card__body">
      <h3 class="product-card__name">${escHtml(product.nombre)}</h3>
      <p class="product-card__desc">${escHtml(product.descripcion || '')}</p>
      <div class="product-card__footer">
        <div class="product-card__price">
          ${priceFormatted}<br><span>MXN</span>
        </div>
        <button class="btn--reserve" data-product-id="${product.id}">
          🛒 Apartar
        </button>
      </div>
    </div>
  `;

  card.querySelector('.btn--reserve').addEventListener('click', () => openModal(product));
  return card;
}

// ============================================================
//  Filtering & Search
// ============================================================
function applyFilters() {
  const searchVal = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';

  let filtered = allProducts;

  if (currentCategory !== 'all') {
    filtered = filtered.filter(p => String(p.categorias?.id) === String(currentCategory));
  }

  if (searchVal) {
    filtered = filtered.filter(p =>
      p.nombre.toLowerCase().includes(searchVal) ||
      (p.descripcion || '').toLowerCase().includes(searchVal)
    );
  }

  renderProducts(filtered);
}

function initSearch() {
  const input = document.getElementById('searchInput');
  if (!input) return;
  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 280);
  });
}

// ============================================================
//  Modal
// ============================================================
function initModal() {
  const overlay  = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');
  const cancelBtn= document.getElementById('cancelBtn');
  const form     = document.getElementById('reserveForm');

  if (!overlay) return;

  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  form?.addEventListener('submit', handleFormSubmit);
}

function openModal(product) {
  selectedProduct = product;
  const overlay = document.getElementById('modalOverlay');
  const preview = document.getElementById('modalProductPreview');
  const form    = document.getElementById('reserveForm');

  if (!overlay) return;

  // Reset form
  form?.reset();
  clearFormErrors();

  // Populate preview
  const categoryName = product.categorias?.nombre || 'General';
  const emoji = getCategoryEmoji(categoryName);
  const imgHtml = product.imagen_url
    ? `<img src="${escHtml(product.imagen_url)}" alt="${escHtml(product.nombre)}" class="preview-img" onerror="this.outerHTML='<div class=\\'preview-placeholder\\'>${emoji}</div>'" />`
    : `<div class="preview-placeholder">${emoji}</div>`;

  preview.innerHTML = `
    ${imgHtml}
    <div class="preview-info">
      <div class="preview-name">${escHtml(product.nombre)}</div>
      <div class="preview-cat">${escHtml(categoryName)}</div>
      <div class="preview-price">${formatPrice(product.precio)} MXN</div>
    </div>
  `;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('clienteName')?.focus();
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay?.classList.remove('active');
  document.body.style.overflow = '';
  selectedProduct = null;
}

// ============================================================
//  Form Submission -> WhatsApp
// ============================================================
async function handleFormSubmit(e) {
  e.preventDefault();

  if (!validateForm()) return;

  const name     = document.getElementById('clienteName').value.trim();
  const phone    = document.getElementById('clientePhone').value.trim();
  const quantity = parseInt(document.getElementById('quantity').value, 10);
  const notes    = document.getElementById('notes').value.trim();

  // Save order to Supabase
  await saveOrder({ name, phone, quantity, notes });

  // Build WhatsApp message
  const msg = buildWhatsAppMessage({ name, phone, quantity, notes, product: selectedProduct });
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  showToast('¡Redirigiendo a WhatsApp!', 'success');
  closeModal();

  setTimeout(() => window.open(waUrl, '_blank'), 300);
}

function buildWhatsAppMessage({ name, phone, quantity, notes, product }) {
  const categoryName = product.categorias?.nombre || 'General';
  const price = formatPrice(product.precio);
  const total = formatPrice(product.precio * quantity);
  const date  = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  let msg = `¡Hola! Quiero apartar un producto en Acuario Martinez 🐠\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📦 *DETALLE DEL PEDIDO*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🐟 Producto: *${product.nombre}*\n`;
  msg += `🏷️ Categoría: ${categoryName}\n`;
  msg += `💰 Precio unitario: ${price} MXN\n`;
  msg += `🔢 Cantidad: ${quantity}\n`;
  msg += `💵 Total estimado: *${total} MXN*\n`;
  msg += `📅 Fecha: ${date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `👤 *MIS DATOS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Nombre: ${name}\n`;
  msg += `Teléfono: ${phone}\n`;

  if (notes) msg += `\n📝 Notas: ${notes}\n`;

  msg += `\nEspero su confirmación. ¡Gracias! 😊`;
  return msg;
}

async function saveOrder({ name, phone, quantity, notes }) {
  if (!supabase || !selectedProduct) return;
  try {
    const { error } = await sbClient.from('pedidos').insert([{
      cliente_nombre:   name,
      cliente_telefono: phone,
      producto_id:      selectedProduct.id,
      cantidad:         quantity,
      notas:            notes || null,
      estado:           'pendiente'
    }]);
    if (error) console.warn('No se pudo guardar el pedido:', error.message);
  } catch (e) {
    console.warn('Error al guardar pedido:', e.message);
  }
}

// ============================================================
//  Form Validation
// ============================================================
function validateForm() {
  clearFormErrors();
  let valid = true;

  const name  = document.getElementById('clienteName');
  const phone = document.getElementById('clientePhone');
  const qty   = document.getElementById('quantity');

  if (!name.value.trim() || name.value.trim().length < 2) {
    showFieldError('clienteName', 'nameError', name);
    valid = false;
  }

  const phoneVal = phone.value.replace(/\D/g, '');
  if (phoneVal.length !== 10) {
    showFieldError('clientePhone', 'phoneError', phone);
    valid = false;
  }

  const qtyVal = parseInt(qty.value, 10);
  if (isNaN(qtyVal) || qtyVal < 1) {
    showFieldError('quantity', 'qtyError', qty);
    valid = false;
  }

  return valid;
}

function showFieldError(inputId, errorId, inputEl) {
  document.getElementById(errorId)?.classList.add('visible');
  inputEl.classList.add('error');
}

function clearFormErrors() {
  document.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.form-group input, .form-group textarea')
    .forEach(el => el.classList.remove('error'));
}

// ============================================================
//  Header scroll effect
// ============================================================
function initHeader() {
  const header = document.getElementById('header');
  if (!header) return;
  const onScroll = () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ============================================================
//  Hamburger menu
// ============================================================
function initHamburger() {
  const btn = document.getElementById('hamburger');
  const nav = document.getElementById('mainNav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    btn.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', open);
  });
  // Close on nav link click
  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      btn.classList.remove('active');
    });
  });
}

// ============================================================
//  WhatsApp Button
// ============================================================
function setWhatsAppInfo() {
  const waBtn  = document.getElementById('whatsappBtn');
  const waPhone= document.getElementById('waPhone');
  if (waBtn) {
    waBtn.href = `https://wa.me/${WHATSAPP_NUMBER}`;
    waBtn.target = '_blank';
    waBtn.rel = 'noopener noreferrer';
  }
  if (waPhone) {
    // Format: 521XXXXXXXXXX -> +52 1 XXX XXX XXXX
    const digits = WHATSAPP_NUMBER.replace(/\D/g, '');
    if (digits.length >= 10) {
      const local = digits.slice(-10);
      waPhone.textContent = `+52 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`;
    } else {
      waPhone.textContent = WHATSAPP_NUMBER;
    }
  }
}

// ============================================================
//  Utilities
// ============================================================
function formatPrice(value) {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(Number(value));
}

function getCategoryEmoji(categoryName) {
  const name = (categoryName || '').toLowerCase();
  if (name.includes('pez') || name.includes('peces') || name.includes('fish')) return '🐟';
  if (name.includes('planta') || name.includes('plant')) return '🌿';
  if (name.includes('accesorio') || name.includes('equipo')) return '⚙️';
  if (name.includes('alimento') || name.includes('comida') || name.includes('food')) return '🥣';
  if (name.includes('coral')) return '🪸';
  return '🐠';
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

function setCurrentYear() {
  const el = document.getElementById('currentYear');
  if (el) el.textContent = new Date().getFullYear();
}
