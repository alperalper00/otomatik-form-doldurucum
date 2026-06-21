<?php
// verify.php - License Verification API
require_once 'db.php';

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Geçersiz istek yöntemi.']);
    exit();
}

// Read JSON input
$input = json_decode(file_get_contents('php://input'), true);

$client_version = isset($input['version']) ? trim($input['version']) : '';

try {
    // Ensure system_settings table exists
    $pdo->exec("CREATE TABLE IF NOT EXISTS `system_settings` (
      `setting_key` VARCHAR(64) PRIMARY KEY,
      `setting_value` TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    
    // Seed default settings if empty
    $checkSettings = $pdo->query("SELECT COUNT(*) FROM system_settings");
    if ($checkSettings->fetchColumn() == 0) {
        $pdo->exec("INSERT INTO system_settings (setting_key, setting_value) VALUES 
          ('min_extension_version', '1.2'),
          ('update_url', 'http://localhost/backend/')");
    }

    // Get settings
    $stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
    $stmt->execute(['min_extension_version']);
    $min_version = $stmt->fetchColumn() ?: '1.2';

    $stmt->execute(['update_url']);
    $update_url = $stmt->fetchColumn() ?: 'http://localhost/backend/';

    if (empty($client_version) || version_compare($client_version, $min_version, '<')) {
        echo json_encode([
            'status' => 'update_required',
            'message' => 'Uzantınızın sürümü eski! Güvenli ve kararlı çalışma için güncellemeniz zorunludur.',
            'update_url' => $update_url
        ]);
        exit();
    }
} catch (Exception $e) {
    // Fail silently or handle
}

$license_key = isset($input['license_key']) ? trim($input['license_key']) : '';
$client_id = isset($input['client_id']) ? trim($input['client_id']) : '';
$client_name = isset($input['client_name']) ? trim($input['client_name']) : '';

// Helper to register/update client details
function upsertClient($pdo, $client_id, $client_name) {
    if (empty($client_id)) return;

    // clients tablosunu otomatik oluştur (yoksa)
    $pdo->exec("CREATE TABLE IF NOT EXISTS `clients` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `client_id` VARCHAR(128) NOT NULL UNIQUE,
      `client_name` VARCHAR(255) DEFAULT NULL,
      `reset_requested` TINYINT NOT NULL DEFAULT 0,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (`client_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    try {
        $pdo->exec("ALTER TABLE `clients` ADD COLUMN `client_name` VARCHAR(255) NULL AFTER `client_id`");
    } catch (Exception $e) {
        // Ignore if already exists
    }

    $stmt = $pdo->prepare("SELECT * FROM clients WHERE client_id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch();

    if (!$client) {
        $insertStmt = $pdo->prepare("INSERT INTO clients (client_id, client_name, reset_requested) VALUES (?, ?, 0)");
        $insertStmt->execute([$client_id, $client_name]);
    } else {
        if (!empty($client_name) && $client['client_name'] !== $client_name) {
            $updateNameStmt = $pdo->prepare("UPDATE clients SET client_name = ? WHERE id = ?");
            $updateNameStmt->execute([$client_name, $client['id']]);
        }
    }
}

// Limit Sıfırlama Talebi Sorgulama
if (isset($input['check_reset']) && $input['check_reset'] === true) {
    if (empty($client_id)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Client ID gerekli.']);
        exit();
    }

    upsertClient($pdo, $client_id, $client_name);

    $stmt = $pdo->prepare("SELECT * FROM clients WHERE client_id = ?");
    $stmt->execute([$client_id]);
    $client = $stmt->fetch();

    if ($client && $client['reset_requested'] == 1) {
        // Talebi sıfırla
        $updateStmt = $pdo->prepare("UPDATE clients SET reset_requested = 0 WHERE id = ?");
        $updateStmt->execute([$client['id']]);
        
        echo json_encode(['status' => 'success', 'reset_limit' => true]);
        exit();
    }

    echo json_encode(['status' => 'success', 'reset_limit' => false]);
    exit();
}

if (empty($license_key) || empty($client_id)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Lütfen lisans anahtarını ve istemci kimliğini gönderin.']);
    exit();
}

try {
    // Upsert client details if we have client_id
    upsertClient($pdo, $client_id, $client_name);

    // Search database for license
    $stmt = $pdo->prepare("SELECT * FROM licenses WHERE license_key = ?");
    $stmt->execute([$license_key]);
    $license = $stmt->fetch();

    if (!$license) {
        echo json_encode([
            'status' => 'error',
            'message' => 'Girdiğiniz lisans anahtarı geçersiz veya bulunamadı.'
        ]);
        exit();
    }

    // Check status
    if ($license['status'] === 'suspended') {
        echo json_encode([
            'status' => 'error',
            'message' => 'Lisansınız askıya alınmıştır. Lütfen satıcıyla iletişime geçin.'
        ]);
        exit();
    }

    // Check expiration
    $expires_at = strtotime($license['expires_at']);
    $now = time();

    if ($license['status'] === 'expired' || $expires_at < $now) {
        if ($license['status'] !== 'expired') {
            // Update db status to expired
            $updateStmt = $pdo->prepare("UPDATE licenses SET status = 'expired' WHERE id = ?");
            $updateStmt->execute([$license['id']]);
        }
        echo json_encode([
            'status' => 'error',
            'message' => 'Lisansınızın kullanım süresi dolmuştur.'
        ]);
        exit();
    }

    // Check device binding (HWID check)
    if (empty($license['client_id'])) {
        // First activation: bind to current client_id
        $bindStmt = $pdo->prepare("UPDATE licenses SET client_id = ?, activated_at = NOW() WHERE id = ?");
        $bindStmt->execute([$client_id, $license['id']]);
        
        echo json_encode([
            'status' => 'success',
            'message' => 'Lisans başarıyla bu cihaza tanımlandı ve aktive edildi.',
            'expires_at' => $license['expires_at']
        ]);
        exit();
    } else if ($license['client_id'] !== $client_id) {
        // License key is being used on another browser/device
        echo json_encode([
            'status' => 'error',
            'message' => 'Bu lisans anahtarı zaten başka bir cihazda/tarayıcıda kullanılmaktadır.'
        ]);
        exit();
    } else {
        // Client ID matches, active license
        echo json_encode([
            'status' => 'success',
            'message' => 'Lisans doğrulandı.',
            'expires_at' => $license['expires_at']
        ]);
        exit();
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'İşlem sırasında bir hata oluştu: ' . $e->getMessage()
    ]);
}
