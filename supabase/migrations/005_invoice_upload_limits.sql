-- ============================================================================
-- Limites côté serveur pour le bucket "invoice"
-- Aligne la contrainte serveur avec la validation client (5 Mo, image/PDF).
-- Sans cela un client malveillant pourrait uploader des fichiers arbitraires.
-- ============================================================================

update storage.buckets
set
  file_size_limit    = 5242880,  -- 5 Mo
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'invoice';
