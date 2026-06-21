<?php
// generate.php - License Key Generator Helper
require_once 'db.php';

// Simple admin authentication (optional but recommended for safety)
// You can access it by going to: generate.php?secret=MasaustuBot2026&days=30
$secret_token = 'MasaustuBot2026';
$req_secret = isset($_GET['secret']) ? $_GET['secret'] : '';

if ($req_secret !== $secret_token) {
    http_response_code(403);
    echo json_encode([
        'status' => 'error',
        'message' => 'Yetkisiz erişim. Lütfen geçerli bir secret parametresi sağlayın.'
    ]);
    exit();
}

$days = isset($_GET['days']) ? intval($_GET['days']) : 30;
if ($days <= 0) {
    $days = 30;
}

// Generate random license key in format XXXX-XXXX-XXXX-XXXX
function generateLicenseKey() {
    $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    $key = '';
    for ($i = 0; $i < 4; $i++) {
        $part = '';
        for ($j = 0; $j < 4; $j++) {
            $part .= $chars[rand(0, strlen($chars) - 1)];
        }
        $key .= $part . ($i < 3 ? '-' : '');
    }
    return $key;
}

$new_key = generateLicenseKey();
$expires_at = date('Y-m-d H:i:s', strtotime("+$days days"));

try {
    $stmt = $pdo->prepare("INSERT INTO licenses (license_key, expires_at, status) VALUES (?, ?, 'active')");
    $stmt->execute([$new_key, $expires_at]);

    echo json_encode([
        'status' => 'success',
        'message' => 'Lisans anahtarı başarıyla üretildi.',
        'license_key' => $new_key,
        'expires_at' => $expires_at,
        'duration_days' => $days
    ], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Lisans üretilirken hata oluştu: ' . $e->getMessage()
    ]);
}
