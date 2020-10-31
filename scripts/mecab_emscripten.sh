em++ \
    src/.libs/mecab.bc \
    src/.libs/libmecab.dylib \
    -o ./module/mecab.js \
    -s EXPORTED_FUNCTIONS="['_mecab_do2']" \
    -s EXTRA_EXPORTED_RUNTIME_METHODS='["cwrap","FS"]' \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s USE_ES6_IMPORT_META=0 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s ENVIRONMENT=web \
    -O3 \
    --no-heap-copy \
    --preload-file mecabrc \
    --preload-file unidic
