#!/bin/bash
cd "$(dirname "$0")"

echo "======================================================"
echo " 🏛️  ACTUALIZADOR DEL ARCHIVO HISTÓRICO DE ESTELLA"
echo "======================================================"
echo ""
echo "▶ Paso 1/2: Buscando y descargando fotos nuevas de Facebook..."
npx tsx scripts/01-facebook-scraper.ts --mode=new

echo ""
echo ""
echo "▶ Paso 2/3: Catalogando fotos nuevas con Gemini IA..."
npx tsx scripts/02-ai-catalog.ts

echo ""
echo "▶ Paso 3/3: Empaquetando catálogo estático y optimizando imágenes para Hostinger..."
npm run build:archive
npm run build

echo ""
echo "======================================================"
echo " 🎉 ¡Proceso completado!"
echo ""
echo " 1. Si quieres sincronizar con Firebase, abre:"
echo "    https://springgreen-grouse-873895.hostingersite.com/import-fotos.html"
echo " 2. Para actualizar tu web en Hostinger, sube el contenido de dist/ a public_html"
echo "======================================================"
echo ""
read -p "Pulsa ENTER para salir..."
