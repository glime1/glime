/* =========================================================
   GLIME — SERVICES MEDIA PERSISTENCE ADDON
   ---------------------------------------------------------
   Purpose:
   - Persist selected image/video/document files to:
       storage.bucket = client-assets
       table          = offer_media
   - Preserve existing Services architecture.
   - Remove deleted media from both Storage + DB.
   - Generate signed URLs for private client-assets media.
   - Support existing image/video flow + documents.
   - No new table.
   - No legacy services table.
========================================================= */

(function () {
  'use strict';

  if (
    typeof supabaseClient === 'undefined' ||
    typeof state === 'undefined'
  ) {
    console.error(
      '[GLIME MEDIA] Core services context is unavailable.'
    );
    return;
  }

  const BUCKET = 'client-assets';
  const SIGNED_URL_SECONDS = 3600;

  function randomId() {
    try {
      if (
        window.crypto &&
        typeof window.crypto.randomUUID === 'function'
      ) {
        return window.crypto.randomUUID();
      }
    } catch (_) {}

    return (
      Date.now().toString(36) +
      '-' +
      Math.random()
        .toString(36)
        .slice(2, 12)
    );
  }

  function safeFileName(file) {
    const raw =
      String(file?.name || 'media');

    const clean =
      raw
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 140);

    return clean || 'media';
  }

  function mediaTypeFromFile(file) {
    const type =
      String(file?.type || '').toLowerCase();

    if (type.startsWith('image/')) {
      return 'image';
    }

    if (type.startsWith('video/')) {
      return 'video';
    }

    if (
      type === 'application/pdf' ||
      type.includes('word') ||
      type.includes('text/')
    ) {
      return 'document';
    }

    return 'file';
  }

  function isSupportedFile(file) {
    const type =
      String(file?.type || '').toLowerCase();

    return (
      type.startsWith('image/') ||
      type.startsWith('video/') ||
      type === 'application/pdf' ||
      type.includes('word') ||
      type.includes('text/')
    );
  }

  function ensurePrimary() {
    if (!Array.isArray(state.media)) {
      state.media = [];
      return;
    }

    if (!state.media.length) {
      return;
    }

    const primaryIndex =
      state.media.findIndex(
        m => !!m.primary
      );

    if (primaryIndex < 0) {
      state.media[0].primary = true;
      return;
    }

    state.media.forEach(
      (m, i) => {
        m.primary =
          i === primaryIndex;
      }
    );
  }

  async function signStoredMedia() {
    if (!Array.isArray(state.media)) {
      return;
    }

    const paths =
      state.media
        .map(m => m.storagePath)
        .filter(Boolean);

    if (!paths.length) {
      return;
    }

    const uniquePaths = [
      ...new Set(paths)
    ];

    const result =
      await supabaseClient
        .storage
        .from(BUCKET)
        .createSignedUrls(
          uniquePaths,
          SIGNED_URL_SECONDS
        );

    if (result.error) {
      console.warn(
        '[GLIME MEDIA] Signed URL generation failed:',
        result.error
      );
      return;
    }

    const urlMap = {};

    (result.data || []).forEach(
      (item, index) => {
        const path =
          uniquePaths[index];

        const signedUrl =
          item?.signedUrl || '';

        if (path && signedUrl) {
          urlMap[path] = signedUrl;
        }
      }
    );

    state.media =
      state.media.map(m => ({
        ...m,

        url:
          m.url ||
          urlMap[m.storagePath] ||
          ''
      }));

    if (
      typeof renderMedia === 'function'
    ) {
      renderMedia();
    }
  }

  async function persistMedia() {
    if (
      !state.offerId ||
      !state.versionId ||
      !state.client?.client_id
    ) {
      return;
    }

    if (!Array.isArray(state.media)) {
      state.media = [];
      return;
    }

    ensurePrimary();

    let existingRows = [];

    {
      const result =
        await supabaseClient
          .from('offer_media')
          .select(
            'id,storage_path'
          )
          .eq(
            'offer_version_id',
            state.versionId
          );

      if (result.error) {
        throw result.error;
      }

      existingRows =
        result.data || [];
    }

    const keepIds =
      new Set(
        state.media
          .filter(m => m?.id)
          .map(m => m.id)
      );

    const removedRows =
      existingRows.filter(
        row =>
          !keepIds.has(row.id)
      );

    const removedPaths =
      removedRows
        .map(
          row =>
            row.storage_path
        )
        .filter(Boolean);

    /*
      First remove deleted files from Storage.
    */
    if (removedPaths.length) {
      const storageDelete =
        await supabaseClient
          .storage
          .from(BUCKET)
          .remove(removedPaths);

      if (storageDelete.error) {
        throw storageDelete.error;
      }
    }

    /*
      Then remove corresponding DB rows.
    */
    if (removedRows.length) {
      const dbDelete =
        await supabaseClient
          .from('offer_media')
          .delete()
          .in(
            'id',
            removedRows.map(
              row => row.id
            )
          );

      if (dbDelete.error) {
        throw dbDelete.error;
      }
    }

    const newItems =
      state.media.filter(
        m =>
          m?.file instanceof File
      );

    const uploadedPaths = [];
    const insertedRows = [];

    try {
      /*
        Upload new files.
      */
      for (
        let index = 0;
        index < newItems.length;
        index++
      ) {
        const media =
          newItems[index];

        const file =
          media.file;

        if (!isSupportedFile(file)) {
          continue;
        }

        const mediaType =
          mediaTypeFromFile(file);

        const path =
          [
            state.client.client_id,
            'offers',
            state.offerId,
            state.versionId,
            randomId() +
              '-' +
              safeFileName(file)
          ].join('/');

        const upload =
          await supabaseClient
            .storage
            .from(BUCKET)
            .upload(
              path,
              file,
              {
                cacheControl: '3600',
                contentType:
                  file.type ||
                  'application/octet-stream',
                upsert: false
              }
            );

        if (upload.error) {
          throw upload.error;
        }

        uploadedPaths.push(path);

        media.storagePath =
          path;

        media.type =
          mediaType;

        media.id = null;

        media.url = '';

        insertedRows.push({
          offer_version_id:
            state.versionId,

          media_type:
            mediaType,

          storage_path:
            path,

          file_url: null,

          alt_text:
            media.alt ||
            file.name.replace(
              /\.[^.]+$/,
              ''
            ),

          sort_order:
            state.media.indexOf(
              media
            ),

          is_primary:
            !!media.primary,

          metadata: {
            original_name:
              file.name,

            mime_type:
              file.type ||
              null,

            size_bytes:
              Number(
                file.size || 0
              )
          }
        });
      }

      /*
        Insert DB rows for newly uploaded files.
      */
      if (insertedRows.length) {
        const insertResult =
          await supabaseClient
            .from('offer_media')
            .insert(
              insertedRows
            )
            .select(
              'id,media_type,storage_path,file_url,alt_text,sort_order,is_primary,metadata'
            );

        if (insertResult.error) {
          throw insertResult.error;
        }

        const inserted =
          insertResult.data || [];

        /*
          Convert local File objects
          into persisted media objects.
        */
        state.media =
          state.media.map(
            media => {
              if (!media?.file) {
                return media;
              }

              const row =
                inserted.find(
                  item =>
                    item.storage_path ===
                    media.storagePath
                );

              if (!row) {
                return media;
              }

              return {
                ...media,

                id: row.id,

                url: '',

                storagePath:
                  row.storage_path,

                type:
                  row.media_type,

                file: null
              };
            }
          );
      }

      /*
        Update existing DB rows.
        This keeps alt text, ordering
        and primary state synchronized.
      */
      const persisted =
        state.media.filter(
          m =>
            m?.id &&
            !m?.file
        );

      for (
        let index = 0;
        index < persisted.length;
        index++
      ) {
        const media =
          persisted[index];

        const updateResult =
          await supabaseClient
            .from('offer_media')
            .update({
              alt_text:
                media.alt ||
                null,

              sort_order:
                state.media.indexOf(
                  media
                ),

              is_primary:
                !!media.primary
            })
            .eq(
              'id',
              media.id
            )
            .eq(
              'offer_version_id',
              state.versionId
            );

        if (updateResult.error) {
          throw updateResult.error;
        }
      }

      /*
        Re-read saved media state so the UI
        has stable DB IDs and signed URLs.
      */
      const reload =
        await supabaseClient
          .from('offer_media')
          .select(
            'id,media_type,storage_path,file_url,alt_text,sort_order,is_primary,metadata'
          )
          .eq(
            'offer_version_id',
            state.versionId
          )
          .order(
            'sort_order'
          );

      if (reload.error) {
        throw reload.error;
      }

      const rows =
        reload.data || [];

      state.media =
        rows.map(row => ({
          id: row.id,

          url:
            row.file_url ||
            '',

          storagePath:
            row.storage_path ||
            '',

          alt:
            row.alt_text ||
            '',

          primary:
            !!row.is_primary,

          type:
            row.media_type,

          metadata:
            row.metadata ||
            {},

          file:
            null
        }));

      ensurePrimary();

      /*
        Keep DB primary flags consistent
        after automatic primary recovery.
      */
      for (
        let index = 0;
        index < state.media.length;
        index++
      ) {
        const media =
          state.media[index];

        const updateResult =
          await supabaseClient
            .from('offer_media')
            .update({
              sort_order:
                index,

              is_primary:
                !!media.primary
            })
            .eq(
              'id',
              media.id
            )
            .eq(
              'offer_version_id',
              state.versionId
            );

        if (updateResult.error) {
          throw updateResult.error;
        }
      }

      await signStoredMedia();

      if (
        typeof renderMedia ===
        'function'
      ) {
        renderMedia();
      }

    } catch (error) {
      /*
        Avoid leaving orphaned files
        when DB insertion/update fails.
      */
      if (
        uploadedPaths.length
      ) {
        try {
          await supabaseClient
            .storage
            .from(BUCKET)
            .remove(
              uploadedPaths
            );
        } catch (cleanupError) {
          console.warn(
            '[GLIME MEDIA] Cleanup failed:',
            cleanupError
          );
        }
      }

      throw error;
    }
  }

  /*
    Extend existing handleFiles().
    The original implementation ignored documents.
  */
  try {
    if (
      typeof handleFiles ===
      'function'
    ) {
      handleFiles =
        function (files) {
          const selected =
            Array.isArray(files)
              ? files
              : [];

          selected
            .filter(
              isSupportedFile
            )
            .forEach(file => {
              let url = '';

              try {
                url =
                  URL.createObjectURL(
                    file
                  );
              } catch (_) {}

              state.media.push({
                file,

                url,

                alt:
                  file.name.replace(
                    /\.[^.]+$/,
                    ''
                  ),

                primary:
                  state.media.length ===
                  0,

                type:
                  mediaTypeFromFile(
                    file
                  ),

                storagePath: ''
              });
            });

          ensurePrimary();

          if (
            typeof renderMedia ===
            'function'
          ) {
            renderMedia();
          }

          if (
            typeof toast ===
            'function' &&
            selected.length
          ) {
            toast(
              'Media added. Save draft or publish to permanently save it.',
              'ok'
            );
          }
        };
    }
  } catch (error) {
    console.warn(
      '[GLIME MEDIA] handleFiles wrapper failed:',
      error
    );
  }

  /*
    Wrap the existing loadStructured().
    This gives private stored media a
    temporary signed URL for preview.
  */
  try {
    if (
      typeof loadStructured ===
      'function'
    ) {
      const originalLoadStructured =
        loadStructured;

      loadStructured =
        async function () {
          await originalLoadStructured();

          await signStoredMedia();
        };
    }
  } catch (error) {
    console.warn(
      '[GLIME MEDIA] loadStructured wrapper failed:',
      error
    );
  }

  /*
    Wrap saveStructured().
    Existing Services save flow remains
    untouched; media persistence simply runs
    after existing structured data is saved.
  */
  try {
    if (
      typeof saveStructured ===
      'function'
    ) {
      const originalSaveStructured =
        saveStructured;

      saveStructured =
        async function () {
          await originalSaveStructured();

          await persistMedia();
        };
    }
  } catch (error) {
    console.warn(
      '[GLIME MEDIA] saveStructured wrapper failed:',
      error
    );
  }

  console.log(
    '[GLIME MEDIA] Media persistence addon loaded.'
  );
})();
