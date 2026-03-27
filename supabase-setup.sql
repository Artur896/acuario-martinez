-- ============================================================
--  AquaVida - Supabase Database Setup
--  Run this SQL in your Supabase project:
--  Dashboard > SQL Editor > New Query > Paste & Run
-- ============================================================

-- ============================================================
--  1. EXTENSION: UUID (usually enabled by default)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
--  2. TABLE: categorias
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.categorias IS 'Categorías de productos de la tienda AquaVida';


-- ============================================================
--  3. TABLE: productos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.productos (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  precio       NUMERIC(10,2) NOT NULL DEFAULT 0,
  imagen_url   TEXT,
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.productos IS 'Catálogo de productos de la tienda AquaVida';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS productos_updated_at ON public.productos;
CREATE TRIGGER productos_updated_at
  BEFORE UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
--  4. TABLE: pedidos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pedidos (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_nombre    TEXT NOT NULL,
  cliente_telefono  TEXT NOT NULL,
  producto_id       UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  cantidad          INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  notas             TEXT,
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','confirmado','entregado','cancelado')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.pedidos IS 'Pedidos/apartados realizados desde la tienda pública';


-- ============================================================
--  5. SAMPLE DATA: Categorías
-- ============================================================
INSERT INTO public.categorias (nombre, descripcion) VALUES
  ('Peces',       'Peces de agua dulce y marina para acuarios'),
  ('Plantas',     'Plantas acuáticas vivas para aquascaping'),
  ('Accesorios',  'Filtros, iluminación, calentadores y más'),
  ('Alimento',    'Alimento especializado para peces y invertebrados')
ON CONFLICT DO NOTHING;


-- ============================================================
--  6. SAMPLE DATA: Productos
--     (References categories inserted above)
-- ============================================================
DO $$
DECLARE
  cat_peces      UUID;
  cat_plantas    UUID;
  cat_accesorios UUID;
  cat_alimento   UUID;
BEGIN
  SELECT id INTO cat_peces      FROM public.categorias WHERE nombre = 'Peces'      LIMIT 1;
  SELECT id INTO cat_plantas    FROM public.categorias WHERE nombre = 'Plantas'    LIMIT 1;
  SELECT id INTO cat_accesorios FROM public.categorias WHERE nombre = 'Accesorios' LIMIT 1;
  SELECT id INTO cat_alimento   FROM public.categorias WHERE nombre = 'Alimento'   LIMIT 1;

  INSERT INTO public.productos (nombre, descripcion, precio, categoria_id, activo, imagen_url) VALUES
  (
    'Guppy Arcoíris',
    'Pez guppy de colores vibrantes. Ideal para principiantes. Muy resistente y activo. Se adapta fácilmente a diferentes condiciones de agua.',
    45.00,
    cat_peces,
    TRUE,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Guppy_coppia.jpg/320px-Guppy_coppia.jpg'
  ),
  (
    'Betta Halfmoon Macho',
    'Hermoso pez Betta con cola en forma de media luna. Colores intensos de azul y rojo. Mantener en acuario individual. Especie popular en todo el mundo.',
    180.00,
    cat_peces,
    TRUE,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Betta_splendens_male.jpg/320px-Betta_splendens_male.jpg'
  ),
  (
    'Anubias Nana',
    'Planta acuática de bajo mantenimiento. No requiere sustrato especial, puede adherirse a rocas o troncos. Crecimiento lento, perfecta para cualquier acuario.',
    85.00,
    cat_plantas,
    TRUE,
    NULL
  ),
  (
    'Java Fern (Microsorum)',
    'Helecho acuático muy resistente. Ideal para acuarios con peces herbívoros ya que no la consumen. No enterrar el rizoma. Gran planta para principiantes.',
    70.00,
    cat_plantas,
    TRUE,
    NULL
  ),
  (
    'Filtro Hang-On 200 L/h',
    'Filtro de mochila exterior para acuarios de hasta 60 litros. Sistema de 3 etapas de filtración: mecánica, química y biológica. Fácil instalación y mantenimiento.',
    350.00,
    cat_accesorios,
    TRUE,
    NULL
  ),
  (
    'Alimento Tetra Min Flakes 100g',
    'Alimento en escamas balanceado para peces tropicales. Fórmula con vitaminas y minerales esenciales. Mejora los colores y la vitalidad. Baja contaminación del agua.',
    95.00,
    cat_alimento,
    TRUE,
    NULL
  )
  ON CONFLICT DO NOTHING;
END $$;


-- ============================================================
--  7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Categorias - public read"  ON public.categorias;
DROP POLICY IF EXISTS "Categorias - auth write"   ON public.categorias;
DROP POLICY IF EXISTS "Productos - public read"   ON public.productos;
DROP POLICY IF EXISTS "Productos - auth write"    ON public.productos;
DROP POLICY IF EXISTS "Pedidos - public insert"   ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos - auth read"       ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos - auth update"     ON public.pedidos;
DROP POLICY IF EXISTS "Pedidos - auth delete"     ON public.pedidos;

-- CATEGORIAS: Anyone can read, only auth users can write
CREATE POLICY "Categorias - public read"
  ON public.categorias FOR SELECT
  USING (TRUE);

CREATE POLICY "Categorias - auth write"
  ON public.categorias FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- PRODUCTOS: Anyone can read active products; only auth users can write
CREATE POLICY "Productos - public read"
  ON public.productos FOR SELECT
  USING (activo = TRUE);

CREATE POLICY "Productos - auth write"
  ON public.productos FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- PEDIDOS: Anyone can insert (place an order); only auth users can read/update/delete
CREATE POLICY "Pedidos - public insert"
  ON public.pedidos FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Pedidos - auth read"
  ON public.pedidos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Pedidos - auth update"
  ON public.pedidos FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Pedidos - auth delete"
  ON public.pedidos FOR DELETE
  USING (auth.role() = 'authenticated');


-- ============================================================
--  8. ADMIN: Allow authenticated users to see ALL products
--     (including inactive ones — needed for admin panel)
-- ============================================================
DROP POLICY IF EXISTS "Productos - auth read all" ON public.productos;

CREATE POLICY "Productos - auth read all"
  ON public.productos FOR SELECT
  USING (
    activo = TRUE
    OR auth.role() = 'authenticated'
  );


-- ============================================================
--  9. STORAGE BUCKET SETUP (run separately or via Dashboard)
-- ============================================================
-- Go to: Supabase Dashboard > Storage > New Bucket
--   Name:          productos
--   Public:        YES (enable public access)
--   File size:     5 MB
--   Allowed types: image/jpeg, image/png, image/webp, image/gif
--
-- Then add these Storage Policies on the "productos" bucket:
--
--   Policy 1 - Public read:
--     Name: "Public read"
--     Allowed operation: SELECT
--     Definition: bucket_id = 'productos'
--
--   Policy 2 - Auth upload:
--     Name: "Auth upload"
--     Allowed operation: INSERT
--     Definition: bucket_id = 'productos' AND auth.role() = 'authenticated'
--
--   Policy 3 - Auth delete:
--     Name: "Auth delete"
--     Allowed operation: DELETE
--     Definition: bucket_id = 'productos' AND auth.role() = 'authenticated'
--
-- OR run these SQL commands in the SQL editor:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productos',
  'productos',
  TRUE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the bucket
DROP POLICY IF EXISTS "Public read products bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Auth upload products bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Auth delete products bucket"   ON storage.objects;

CREATE POLICY "Public read products bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'productos');

CREATE POLICY "Auth upload products bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'productos' AND auth.role() = 'authenticated');

CREATE POLICY "Auth delete products bucket"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'productos' AND auth.role() = 'authenticated');


-- ============================================================
--  10. QUICK VERIFICATION QUERIES
-- ============================================================
-- Run these to verify the setup:
--
--   SELECT * FROM public.categorias;
--   SELECT * FROM public.productos;
--   SELECT COUNT(*) FROM public.productos WHERE activo = TRUE;
--
-- ============================================================
--  SETUP COMPLETE
--  Next steps:
--  1. Copy your Supabase URL and anon key from:
--     Dashboard > Project Settings > API
--  2. Paste them into: c:/xampp/htdocs/Acuario/config.js
--  3. Create an admin user in:
--     Dashboard > Authentication > Users > Invite user
--  4. Open http://localhost/Acuario/ in your browser
-- ============================================================
