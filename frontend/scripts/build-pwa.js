#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Optimizando build para PWA...');

const buildDir = path.join(__dirname, '../build');
const staticDir = path.join(buildDir, 'static');

// Verificar que existe el directorio build
if (!fs.existsSync(buildDir)) {
  console.error('❌ Directorio build no encontrado. Ejecuta npm run build primero.');
  process.exit(1);
}

// 1. Crear robots.txt optimizado
const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /static/js/
Disallow: /static/css/

Sitemap: ${process.env.REACT_APP_SITE_URL || 'https://parkeasy.app'}/sitemap.xml
`;

fs.writeFileSync(path.join(buildDir, 'robots.txt'), robotsTxt);
console.log('✅ robots.txt creado');

// 2. Crear sitemap básico
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${process.env.REACT_APP_SITE_URL || 'https://parkeasy.app'}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${process.env.REACT_APP_SITE_URL || 'https://parkeasy.app'}/promotions</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`;

fs.writeFileSync(path.join(buildDir, 'sitemap.xml'), sitemap);
console.log('✅ sitemap.xml creado');

// 3. Optimizar manifest.json
const manifestPath = path.join(buildDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Asegurar que tiene todos los campos necesarios para PWA
  manifest.display = 'standalone';
  manifest.orientation = 'portrait-primary';
  manifest.start_url = '/';
  manifest.scope = '/';
  
  // Agregar categorías para app stores
  manifest.categories = ['transportation', 'utilities', 'productivity'];
  
  // Configurar screenshots para app store (si existen)
  if (!manifest.screenshots) {
    manifest.screenshots = [
      {
        src: 'screenshot-mobile.png',
        sizes: '320x640',
        type: 'image/png',
        form_factor: 'narrow'
      },
      {
        src: 'screenshot-desktop.png', 
        sizes: '1280x720',
        type: 'image/png',
        form_factor: 'wide'
      }
    ];
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('✅ manifest.json optimizado');
}

// 4. Crear archivo .htaccess para Apache (si se despliega en Apache)
const htaccess = `# PWA Configuration
<IfModule mod_headers.c>
    # Cache static assets
    <FilesMatch "\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$">
        ExpiresActive On
        ExpiresDefault "access plus 1 year"
        Header append Cache-Control "public, immutable"
    </FilesMatch>
    
    # Cache HTML with shorter expiry
    <FilesMatch "\\.(html|htm)$">
        ExpiresActive On
        ExpiresDefault "access plus 1 hour"
        Header set Cache-Control "public, must-revalidate"
    </FilesMatch>
    
    # Service Worker - never cache
    <FilesMatch "sw\\.js$">
        ExpiresActive Off
        Header set Cache-Control "no-cache, no-store, must-revalidate"
        Header set Pragma "no-cache"
        Header set Expires "0"
    </FilesMatch>
    
    # Manifest
    <FilesMatch "manifest\\.json$">
        Header set Content-Type "application/manifest+json"
        ExpiresActive On
        ExpiresDefault "access plus 1 week"
    </FilesMatch>
</IfModule>

# Security headers
<IfModule mod_headers.c>
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-XSS-Protection "1; mode=block"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/plain
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/xml
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/xml
    AddOutputFilterByType DEFLATE application/xhtml+xml
    AddOutputFilterByType DEFLATE application/rss+xml
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/x-javascript
    AddOutputFilterByType DEFLATE application/json
    AddOutputFilterByType DEFLATE application/manifest+json
</IfModule>

# Redirect all requests to index.html for SPA routing
<IfModule mod_rewrite.c>
    RewriteEngine On
    
    # Handle Angular and React Router
    RewriteBase /
    RewriteRule ^index\\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>`;

fs.writeFileSync(path.join(buildDir, '.htaccess'), htaccess);
console.log('✅ .htaccess creado para Apache');

// 5. Crear archivo de configuración para Nginx
const nginxConf = `# PWA Configuration for Nginx
# Coloca esto dentro de tu bloque server {}

location / {
    try_files $uri $uri/ /index.html;
}

# Cache static assets
location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    access_log off;
}

# Cache HTML with shorter expiry
location ~* \\.(html|htm)$ {
    expires 1h;
    add_header Cache-Control "public, must-revalidate";
}

# Service Worker - never cache
location = /sw.js {
    expires -1;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
}

# Manifest
location = /manifest.json {
    expires 1w;
    add_header Content-Type "application/manifest+json";
}

# Security headers
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml application/javascript application/json application/xml+rss application/atom+xml image/svg+xml;`;

fs.writeFileSync(path.join(buildDir, 'nginx.conf.example'), nginxConf);
console.log('✅ nginx.conf.example creado');

// 6. Generar reporte de build
const generateBuildReport = () => {
  const report = {
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    files: {},
    totalSize: 0
  };

  const scanDirectory = (dir, basePath = '') => {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const relativePath = path.join(basePath, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        scanDirectory(filePath, relativePath);
      } else {
        report.files[relativePath] = {
          size: stats.size,
          sizeKB: Math.round(stats.size / 1024 * 100) / 100
        };
        report.totalSize += stats.size;
      }
    });
  };

  scanDirectory(buildDir);
  report.totalSizeKB = Math.round(report.totalSize / 1024 * 100) / 100;
  report.totalSizeMB = Math.round(report.totalSize / 1024 / 1024 * 100) / 100;

  fs.writeFileSync(
    path.join(buildDir, 'build-report.json'), 
    JSON.stringify(report, null, 2)
  );
  
  console.log(`✅ Build report generado (${report.totalSizeKB} KB total)`);
};

generateBuildReport();

// 7. Verificar archivos críticos PWA
const criticalFiles = ['manifest.json', 'sw.js', 'index.html'];
const missingFiles = criticalFiles.filter(file => !fs.existsSync(path.join(buildDir, file)));

if (missingFiles.length > 0) {
  console.warn('⚠️ Archivos PWA faltantes:', missingFiles.join(', '));
} else {
  console.log('✅ Todos los archivos PWA críticos están presentes');
}

console.log('🎉 Optimización PWA completada');
console.log('');
console.log('📋 Próximos pasos:');
console.log('  1. Prueba la PWA con: npm run serve');
console.log('  2. Analiza el bundle con: npm run analyze');  
console.log('  3. Ejecuta Lighthouse con: npm run lighthouse');
console.log('  4. Sube los archivos del directorio build/ a tu servidor');
console.log('');