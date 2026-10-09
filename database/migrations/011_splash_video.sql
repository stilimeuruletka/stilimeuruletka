-- ================================================================
-- 011_splash_video.sql
-- Видео-сплэш: таблица app_settings и бакет storage
-- ================================================================

-- Таблица ключ/значение для настроек приложения
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- По умолчанию используем существующее видео профиля как обложку-сплэш
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('splash_video_url', '/IMG_2304.MP4', now())
ON CONFLICT (key) DO NOTHING;

-- Бакет для загружаемых из админки файлов (видео сплэша)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('splash', 'splash', true, 104857600, ARRAY['video/mp4'])
ON CONFLICT (id) DO NOTHING;

-- Политики доступа к бакету splash
-- Чтение: аноним (публичный файл для сплэша)
DROP POLICY IF EXISTS "splash_public_read" ON storage.objects;
CREATE POLICY "splash_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'splash');

-- Запись: через service_role (обход RLS). Блокируем анонимную вставку.
CREATE POLICY "splash_no_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'splash' AND (false));