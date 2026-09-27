<?php
// V6: konfigurasi database fleksibel untuk XAMPP/Laragon dan deployment Vercel.
// Lokal tetap bekerja tanpa .env: localhost / root / password kosong.
$host = getenv('DB_HOST') ?: 'localhost';
$port = getenv('DB_PORT') ?: '3306';
$db   = getenv('DB_NAME') ?: 'adrian_laptop_kp';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASSWORD') !== false ? getenv('DB_PASSWORD') : '';
$charset = 'utf8mb4';

// Opsional: isi DB_DSN bila provider database memberikan DSN PDO khusus.
$dsn = getenv('DB_DSN');
if (!$dsn) {
    $dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";
}

$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
    PDO::ATTR_TIMEOUT => 10,
];

// Opsional untuk provider MySQL yang mewajibkan CA certificate.
$sslCa = getenv('DB_SSL_CA');
if ($sslCa && defined('PDO::MYSQL_ATTR_SSL_CA')) {
    $options[PDO::MYSQL_ATTR_SSL_CA] = $sslCa;
}

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    http_response_code(500);
    $isLocal = in_array($host, ['localhost', '127.0.0.1'], true);
    $message = $isLocal
        ? 'Koneksi database gagal. Pastikan MySQL XAMPP/Laragon aktif dan database adrian_laptop_kp sudah di-import.'
        : 'Koneksi database gagal. Periksa Environment Variables database pada hosting.';
    die($message);
}
?>
