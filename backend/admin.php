<?php
// admin.php - License Control & Admin Panel
session_start();

$db_host = 'localhost';
$db_name = 'form_bot';
$db_user = 'root';
$db_pass = ''; // Database password

$admin_pass = 'MasaustuBot2026'; // Admin dashboard password
$error = '';
$success = '';
$min_version = '1.2';
$update_url = 'http://localhost/backend/';

// Connect to Database
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    die("Veritabanı bağlantı hatası: " . $e->getMessage());
}

// Handle Logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    unset($_SESSION['admin_auth']);
    session_destroy();
    header("Location: admin.php");
    exit();
}

// Handle Login Form
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login_btn'])) {
    $pass = isset($_POST['password']) ? $_POST['password'] : '';
    if ($pass === $admin_pass) {
        $_SESSION['admin_auth'] = true;
        header("Location: admin.php");
        exit();
    } else {
        $error = 'Hatalı yönetim şifresi!';
    }
}

// Check Authentication
$isAuthenticated = isset($_SESSION['admin_auth']) && $_SESSION['admin_auth'] === true;

// Handle AJAX Chat Actions
if (isset($_GET['ajax']) && $_GET['ajax'] === '1') {
    if (!$isAuthenticated) {
        header('Content-Type: application/json; charset=UTF-8');
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Yetkisiz erişim.']);
        exit();
    }
    
    header('Content-Type: application/json; charset=UTF-8');
    $action = $_GET['action'] ?? '';
    
    try {
        if ($action === 'get_chat') {
            $ticket_id = intval($_GET['ticket_id'] ?? 0);
            if ($ticket_id <= 0) {
                echo json_encode(['status' => 'error', 'message' => 'Geçersiz bilet ID.']);
                exit();
            }
            
            // Get ticket details
            $stmt = $pdo->prepare("SELECT f.*, c.client_name, l.status AS license_status, l.expires_at AS license_expires_at FROM feedback f LEFT JOIN clients c ON f.client_id = c.client_id LEFT JOIN licenses l ON f.client_id = l.client_id WHERE f.id = ?");
            $stmt->execute([$ticket_id]);
            $ticket = $stmt->fetch();
            
            if (!$ticket) {
                echo json_encode(['status' => 'error', 'message' => 'Talep bulunamadı.']);
                exit();
            }
            
            // Get messages
            $stmt = $pdo->prepare("SELECT sender, message, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC");
            $stmt->execute([$ticket_id]);
            $messages = $stmt->fetchAll();
            
            echo json_encode(['status' => 'success', 'ticket' => $ticket, 'messages' => $messages]);
            exit();
        }
        
        else if ($action === 'send_message') {
            $ticket_id = intval($_POST['ticket_id'] ?? 0);
            $message = trim($_POST['message'] ?? '');
            
            if ($ticket_id <= 0 || empty($message)) {
                echo json_encode(['status' => 'error', 'message' => 'Eksik veya geçersiz parametreler.']);
                exit();
            }
            
            // Insert message
            $stmt = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message) VALUES (?, 'admin', ?)");
            $stmt->execute([$ticket_id, $message]);
            
            // Update status and clear nudge
            $stmt = $pdo->prepare("UPDATE feedback SET status = 'answered', nudge = 0 WHERE id = ?");
            $stmt->execute([$ticket_id]);
            
            echo json_encode(['status' => 'success']);
            exit();
        }
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        exit();
    }
}

if ($isAuthenticated && $_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    $action = $_POST['action'];
    $id = isset($_POST['id']) ? intval($_POST['id']) : 0;

    try {
        if ($action === 'generate') {
            $days = isset($_POST['days']) ? intval($_POST['days']) : 30;
            if ($days <= 0) $days = 30;

            // Generate format: XXXX-XXXX-XXXX-XXXX
            $chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            $key = '';
            for ($i = 0; $i < 4; $i++) {
                $part = '';
                for ($j = 0; $j < 4; $j++) {
                    $part .= $chars[rand(0, strlen($chars) - 1)];
                }
                $key .= $part . ($i < 3 ? '-' : '');
            }

            $expires_at = date('Y-m-d H:i:s', strtotime("+$days days"));
            $stmt = $pdo->prepare("INSERT INTO licenses (license_key, expires_at, status) VALUES (?, ?, 'active')");
            $stmt->execute([$key, $expires_at]);

            $success = "Yeni lisans anahtarı üretildi: <strong>$key</strong> (Bitiş: " . date('d.m.Y H:i', strtotime($expires_at)) . ")";
        } 
        
        else if ($action === 'suspend' && $id > 0) {
            $stmt = $pdo->prepare("UPDATE licenses SET status = 'suspended' WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Lisans başarıyla askıya alındı (iptal edildi).";
        } 
        
        else if ($action === 'activate' && $id > 0) {
            // Get original expiry
            $stmt = $pdo->prepare("SELECT expires_at FROM licenses WHERE id = ?");
            $stmt->execute([$id]);
            $lic = $stmt->fetch();
            
            // If expired, let's extend by 30 days, else keep original
            $status = 'active';
            $expires_at = $lic['expires_at'];
            if (strtotime($lic['expires_at']) < time()) {
                $expires_at = date('Y-m-d H:i:s', strtotime("+30 days"));
                $success = "Lisans süresi geçmişti, 30 gün uzatılıp tekrar aktif edildi.";
            } else {
                $success = "Lisans başarıyla tekrar aktif edildi.";
            }

            $stmt = $pdo->prepare("UPDATE licenses SET status = ?, expires_at = ? WHERE id = ?");
            $stmt->execute([$status, $expires_at, $id]);
        } 
        
        else if ($action === 'reset_client' && $id > 0) {
            $stmt = $pdo->prepare("UPDATE licenses SET client_id = NULL, activated_at = NULL WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Cihaz bağlayıcı kimliği sıfırlandı. Lisans başka bir cihazda aktive edilebilir.";
        } 
        
        else if ($action === 'delete' && $id > 0) {
            $stmt = $pdo->prepare("DELETE FROM licenses WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Lisans veritabanından başarıyla silindi.";
        }

        else if ($action === 'reset_all_limits') {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `clients` (
              `id` INT AUTO_INCREMENT PRIMARY KEY,
              `client_id` VARCHAR(128) NOT NULL UNIQUE,
              `reset_requested` TINYINT NOT NULL DEFAULT 0,
              `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            $pdo->exec("UPDATE clients SET reset_requested = 1");
            $success = "Tüm ücretsiz kullanıcıların limit sıfırlama talepleri oluşturuldu.";
        }

        else if ($action === 'reset_single_limit' && $id > 0) {
            $stmt = $pdo->prepare("UPDATE clients SET reset_requested = 1 WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Seçilen istemcinin limit sıfırlama talebi oluşturuldu.";
        }

        else if ($action === 'delete_client' && $id > 0) {
            $stmt = $pdo->prepare("DELETE FROM clients WHERE id = ?");
            $stmt->execute([$id]);
            $success = "İstemci kaydı veritabanından başarıyla silindi.";
        }
        else if ($action === 'delete_feedback' && $id > 0) {
            $stmt = $pdo->prepare("DELETE FROM ticket_messages WHERE ticket_id = ?");
            $stmt->execute([$id]);
            $stmt = $pdo->prepare("DELETE FROM feedback WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Geri bildirim başarıyla silindi.";
        }
        else if ($action === 'reply_feedback' && $id > 0) {
            $reply = isset($_POST['reply_text']) ? trim($_POST['reply_text']) : '';
            if (empty($reply)) {
                $error = "Yanıt içeriği boş olamaz!";
            } else {
                $stmt = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message) VALUES (?, 'admin', ?)");
                $stmt->execute([$id, $reply]);

                $stmt = $pdo->prepare("UPDATE feedback SET status = 'answered', nudge = 0 WHERE id = ?");
                $stmt->execute([$id]);
                $success = "Destek talebine başarıyla yanıt gönderildi.";
            }
        }
        else if ($action === 'close_feedback' && $id > 0) {
            $stmt = $pdo->prepare("UPDATE feedback SET status = 'closed', nudge = 0 WHERE id = ?");
            $stmt->execute([$id]);
            $success = "Destek talebi başarıyla kapatıldı.";
        }
        else if ($action === 'save_settings') {
            $min_ver = trim($_POST['min_version'] ?? '1.2');
            $up_url = trim($_POST['update_url'] ?? 'http://localhost/backend/');
            
            $pdo->exec("CREATE TABLE IF NOT EXISTS `system_settings` (
              `setting_key` VARCHAR(64) PRIMARY KEY,
              `setting_value` TEXT NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

            $stmt = $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('min_extension_version', ?) 
              ON DUPLICATE KEY UPDATE setting_value = ?");
            $stmt->execute([$min_ver, $min_ver]);

            $stmt = $pdo->prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('update_url', ?) 
              ON DUPLICATE KEY UPDATE setting_value = ?");
            $stmt->execute([$up_url, $up_url]);

            $min_version = $min_ver;
            $update_url = $up_url;
            $success = "Sistem ayarları başarıyla kaydedildi.";
        }
    } catch (PDOException $e) {
        $error = "İşlem hatası: " . $e->getMessage();
    }
}

// Fetch Licenses & Clients if authenticated
$licenses = [];
$clients = [];
$feedbacks = [];
if ($isAuthenticated) {
    try {
        // Ensure table exists
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
        } catch (Exception $e) {}

        // Ensure feedback table exists
        $pdo->exec("CREATE TABLE IF NOT EXISTS `feedback` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `client_id` VARCHAR(128) NOT NULL,
          `email` VARCHAR(255) NOT NULL,
          `message` TEXT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        try {
            $pdo->exec("ALTER TABLE `feedback` ADD COLUMN `reply` TEXT NULL AFTER `message`");
        } catch (Exception $e) {}
        try {
            $pdo->exec("ALTER TABLE `feedback` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'open' AFTER `reply`");
        } catch (Exception $e) {}
        try {
            $pdo->exec("ALTER TABLE `feedback` ADD COLUMN `nudge` TINYINT NOT NULL DEFAULT 0 AFTER `status`");
        } catch (Exception $e) {}

        // Ensure ticket_messages table exists
        $pdo->exec("CREATE TABLE IF NOT EXISTS `ticket_messages` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `ticket_id` INT NOT NULL,
          `sender` ENUM('user', 'admin') NOT NULL,
          `message` TEXT NOT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX (`ticket_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // Migrate legacy feedback data to ticket_messages table
        try {
            $stmt = $pdo->query("SELECT id, message, reply FROM feedback");
            $all_tickets = $stmt->fetchAll();
            foreach ($all_tickets as $t) {
                $check = $pdo->prepare("SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = ?");
                $check->execute([$t['id']]);
                if ($check->fetchColumn() == 0) {
                    if (!empty($t['message'])) {
                        $ins = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message, created_at) VALUES (?, 'user', ?, NOW())");
                        $ins->execute([$t['id'], $t['message']]);
                    }
                    if (!empty($t['reply'])) {
                        $ins = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message, created_at) VALUES (?, 'admin', ?, NOW())");
                        $ins->execute([$t['id'], $t['reply']]);
                    }
                }
            }
        } catch (Exception $e) {}

        // Query licenses with their associated client labels
        $stmt = $pdo->query("SELECT l.*, c.client_name FROM licenses l LEFT JOIN clients c ON l.client_id = c.client_id ORDER BY l.created_at DESC");
        $licenses = $stmt->fetchAll();

        $stmt = $pdo->query("SELECT * FROM clients ORDER BY updated_at DESC");
        $clients = $stmt->fetchAll();

        $stmt = $pdo->query("SELECT f.*, c.client_name, l.status AS license_status, l.expires_at AS license_expires_at FROM feedback f LEFT JOIN clients c ON f.client_id = c.client_id LEFT JOIN licenses l ON f.client_id = l.client_id ORDER BY f.created_at DESC");
        $feedbacks = $stmt->fetchAll();

        // Fetch System Settings
        $pdo->exec("CREATE TABLE IF NOT EXISTS `system_settings` (
          `setting_key` VARCHAR(64) PRIMARY KEY,
          `setting_value` TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $checkSettings = $pdo->query("SELECT COUNT(*) FROM system_settings");
        if ($checkSettings->fetchColumn() == 0) {
            $pdo->exec("INSERT INTO system_settings (setting_key, setting_value) VALUES 
              ('min_extension_version', '1.2'),
              ('update_url', 'http://localhost/backend/')");
        }

        $stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        $stmt->execute(['min_extension_version']);
        $min_version = $stmt->fetchColumn() ?: '1.2';

        $stmt->execute(['update_url']);
        $update_url = $stmt->fetchColumn() ?: 'http://localhost/backend/';
    } catch (PDOException $e) {
        $error = "Veri okuma hatası: " . $e->getMessage();
    }
}
?>
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Form Botu - Lisans Yönetim Paneli</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0d0d0f;
            --surface: #141418;
            --surface2: #1c1c22;
            --border: #2a2a32;
            --accent: #7c6aff;
            --accent-glow: rgba(124, 106, 255, 0.4);
            --text: #e8e8f0;
            --muted: #8e8e9f;
            --green: #00e676;
            --green-glow: rgba(0, 230, 118, 0.2);
            --red: #ff4444;
            --red-glow: rgba(255, 68, 68, 0.2);
            --orange: #ffa726;
            --orange-glow: rgba(255, 167, 38, 0.2);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: 'Inter', sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        a {
            color: var(--accent);
            text-decoration: none;
            transition: opacity 0.2s;
        }

        a:hover {
            opacity: 0.8;
        }

        /* Login Ekranı */
        .login-container {
            margin: auto;
            width: 100%;
            max-width: 360px;
            padding: 30px;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            text-align: center;
        }

        .login-container h1 {
            font-family: 'Syne', sans-serif;
            font-size: 20px;
            font-weight: 800;
            margin-bottom: 20px;
            letter-spacing: -0.5px;
        }

        .input-group {
            margin-bottom: 15px;
            text-align: left;
        }

        .input-group label {
            display: block;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--muted);
            margin-bottom: 6px;
            font-family: 'Space Mono', monospace;
        }

        input[type="password"], input[type="number"], input[type="text"] {
            width: 100%;
            background: var(--surface2);
            border: 1px solid var(--border);
            color: var(--text);
            font-family: 'Space Mono', monospace;
            padding: 10px 14px;
            border-radius: 8px;
            font-size: 13px;
            outline: none;
            transition: border-color 0.2s;
        }

        input:focus {
            border-color: var(--accent);
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: var(--accent);
            color: #fff;
            font-family: 'Space Mono', monospace;
            font-weight: bold;
            font-size: 12px;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            cursor: pointer;
            width: 100%;
            transition: transform 0.1s, opacity 0.2s, box-shadow 0.2s;
            text-transform: uppercase;
        }

        .btn:hover {
            opacity: 0.9;
            box-shadow: 0 0 12px var(--accent-glow);
        }

        .btn:active {
            transform: scale(0.98);
        }

        .alert {
            padding: 12px 16px;
            border-radius: 8px;
            margin-bottom: 20px;
            font-size: 13px;
            line-height: 1.5;
            text-align: left;
        }

        .alert-error {
            background: rgba(255, 68, 68, 0.08);
            border: 1px solid rgba(255, 68, 68, 0.2);
            color: var(--red);
        }

        .alert-success {
            background: rgba(0, 230, 118, 0.08);
            border: 1px solid rgba(0, 230, 118, 0.2);
            color: var(--green);
        }

        /* Ana Panel Layout */
        .wrapper {
            width: 100%;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px 0 25px;
            border-bottom: 1px solid var(--border);
            margin-bottom: 25px;
        }

        header h2 {
            font-family: 'Syne', sans-serif;
            font-weight: 800;
            font-size: 22px;
            letter-spacing: -0.5px;
        }

        .logout-btn {
            font-family: 'Space Mono', monospace;
            font-size: 11px;
            background: transparent;
            border: 1px solid var(--border);
            color: var(--muted);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s;
        }

        .logout-btn:hover {
            border-color: var(--red);
            color: var(--red);
        }

        .panel-grid {
            display: grid;
            grid-template-columns: 320px 1fr;
            gap: 25px;
        }

        @media (max-width: 768px) {
            .panel-grid {
                grid-template-columns: 1fr;
            }
        }

        .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            margin-bottom: 20px;
        }

        .card h3 {
            font-family: 'Syne', sans-serif;
            font-size: 14px;
            font-weight: 700;
            color: var(--text);
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-left: 3px solid var(--accent);
            padding-left: 8px;
        }

        /* Liste ve Tablolar */
        .table-container {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        th {
            background: var(--surface2);
            text-align: left;
            padding: 12px 14px;
            color: var(--muted);
            font-family: 'Space Mono', monospace;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-bottom: 2px solid var(--border);
        }

        td {
            padding: 12px 14px;
            border-bottom: 1px solid var(--border);
            vertical-align: middle;
        }

        tr:hover td {
            background: rgba(255,255,255,0.01);
        }

        .license-key-cell {
            font-family: 'Space Mono', monospace;
            font-weight: bold;
            color: var(--text);
        }

        .client-id-cell {
            font-family: 'Space Mono', monospace;
            font-size: 11px;
            color: var(--muted);
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }

        .badge-active {
            background: rgba(0, 230, 118, 0.08);
            border: 1px solid rgba(0, 230, 118, 0.2);
            color: var(--green);
        }

        .badge-expired {
            background: rgba(255, 167, 38, 0.08);
            border: 1px solid rgba(255, 167, 38, 0.2);
            color: var(--orange);
        }

        .badge-suspended {
            background: rgba(255, 68, 68, 0.08);
            border: 1px solid rgba(255, 68, 68, 0.2);
            color: var(--red);
        }

        .btn-action {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text);
            font-family: 'Space Mono', monospace;
            font-size: 10px;
            padding: 5px 10px;
            border-radius: 0px;
            cursor: pointer;
            margin-right: 4px;
            transition: all 0.2s;
        }

        .btn-suspend:hover {
            border-color: var(--red);
            color: var(--red);
            background: rgba(255,68,68,0.05);
            box-shadow: 0 0 8px var(--red-glow);
        }

        .btn-activate:hover {
            border-color: var(--green);
            color: var(--green);
            background: rgba(0, 230, 118,0.05);
            box-shadow: 0 0 8px var(--green-glow);
        }

        .btn-reset-hwid:hover {
            border-color: var(--orange);
            color: var(--orange);
            background: rgba(255, 167, 38,0.05);
            box-shadow: 0 0 8px var(--orange-glow);
        }

        .btn-delete:hover {
            border-color: var(--red);
            color: #fff;
            background: var(--red);
            box-shadow: 0 0 8px var(--red-glow);
        }

        .date-cell {
            color: var(--muted);
            font-family: 'Space Mono', monospace;
            font-size: 11px;
        }

        /* ADMIN TICKET YANIT ALANI VE SEKMELERİ */
        .admin-reply-textarea {
            flex: 1;
            min-height: 38px;
            background: transparent !important;
            border: none !important;
            border-bottom: 1px solid var(--border) !important;
            border-radius: 0px !important;
            color: #fff !important;
            padding: 6px 0 !important;
            font-size: 11px;
            font-family: inherit;
            resize: vertical;
            outline: none;
            margin: 0;
            transition: border-color 0.2s;
        }

        .admin-reply-textarea:focus {
            border-bottom-color: var(--accent) !important;
        }

        .admin-reply-btn {
            background: transparent !important;
            border: 1px solid var(--accent) !important;
            color: var(--accent) !important;
            font-family: 'Space Mono', monospace !important;
            font-size: 10px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            padding: 0 15px !important;
            height: 38px !important;
            line-height: 36px !important;
            border-radius: 0px !important;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .admin-reply-btn:hover {
            background: var(--accent) !important;
            color: #000 !important;
            box-shadow: 0 0 10px var(--accent-glow) !important;
        }

        @keyframes pulse-orange {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.03); opacity: 0.85; }
        }

        /* Admin Chat Modal Styles */
        .modal-chat-bubble-wrapper {
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .modal-chat-bubble {
            max-width: 80%;
            padding: 10px 14px;
            border-radius: 12px;
            font-size: 12px;
            line-height: 1.4;
            word-break: break-word;
            position: relative;
            margin-bottom: 2px;
        }
        .modal-chat-bubble.user {
            align-self: flex-start;
            background: var(--surface2);
            border: 1px solid var(--border);
            color: var(--text);
            border-bottom-left-radius: 2px;
        }
        .modal-chat-bubble.admin {
            align-self: flex-end;
            background: var(--accent);
            color: #fff;
            border-bottom-right-radius: 2px;
        }
        .modal-chat-bubble-time {
            font-size: 9px;
            color: var(--muted);
            margin-top: 4px;
            display: block;
            text-align: right;
        }
        .modal-chat-bubble.user .modal-chat-bubble-time {
            text-align: left;
        }
    </style>
</head>
<body>

    <?php if (!$isAuthenticated): ?>
        <!-- LOGIN SCREEN -->
        <div class="login-container">
            <h1>🔒 LİSANS YÖNETİMİ</h1>
            <?php if (!empty($error)): ?>
                <div class="alert alert-error"><?= htmlspecialchars($error) ?></div>
            <?php endif; ?>
            <form action="admin.php" method="POST">
                <div class="input-group">
                    <label for="password">Yönetim Şifresi</label>
                    <input type="password" name="password" id="password" placeholder="••••••••" required autofocus>
                </div>
                <button type="submit" name="login_btn" class="btn">Giriş Yap</button>
            </form>
        </div>
    <?php else: ?>
        <!-- ADMIN DASHBOARD -->
        <div class="wrapper">
            <header>
                <h2>⚙️ LİSANS KONTROL PANELİ</h2>
                <a href="admin.php?action=logout" class="logout-btn">ÇIKIŞ YAP 🔓</a>
            </header>

            <?php if (!empty($error)): ?>
                <div class="alert alert-error"><?= $error ?></div>
            <?php endif; ?>

            <?php if (!empty($success)): ?>
                <div class="alert alert-success"><?= $success ?></div>
            <?php endif; ?>

            <div class="panel-grid">
                <!-- Sol Taraf - Lisans Üretme Formu -->
                <div class="left-panel">
                    <div class="card">
                        <h3>🔑 Lisans Anahtarı Üret</h3>
                        <form action="admin.php" method="POST" style="display: flex; flex-direction: column; gap: 15px;">
                            <input type="hidden" name="action" value="generate">
                            <div class="input-group">
                                <label for="days">Geçerlilik Süresi (Gün)</label>
                                <input type="number" name="days" id="days" value="30" min="1" max="1000" required>
                            </div>
                            <button type="submit" class="btn">LİSANS ÜRET ⚡</button>
                        </form>
                    </div>

                    <div class="card">
                        <h3>🔄 Ücretsiz Limit Sıfırlama</h3>
                        <form action="admin.php" method="POST" onsubmit="return confirm('Tüm ücretsiz kullanıcıların form limitlerini sıfırlamak istediğinize emin misiniz?');">
                            <input type="hidden" name="action" value="reset_all_limits">
                            <p style="font-size: 11px; color: var(--muted); margin-bottom: 12px; line-height: 1.4;">
                                Bu işlem, sistemdeki tüm ücretsiz istemcilerin 6 saatlik 20 adet form limitini anında sıfırlar.
                            </p>
                            <button type="submit" class="btn" style="background: var(--orange); color: #000; box-shadow: 0 0 10px rgba(255,167,38,0.2); border: none;">TÜM LİMİTLERİ SIFIRLA 🔄</button>
                        </form>
                    </div>

                    <div class="card">
                        <h3>📡 Sistem ve Güncelleme Ayarları</h3>
                        <form action="admin.php" method="POST" style="display: flex; flex-direction: column; gap: 15px;">
                            <input type="hidden" name="action" value="save_settings">
                            <div class="input-group">
                                <label for="min_version">Zorunlu Min. Sürüm</label>
                                <input type="text" name="min_version" id="min_version" value="<?= htmlspecialchars($min_version) ?>" placeholder="Örn: 1.2" required>
                            </div>
                            <div class="input-group">
                                <label for="update_url">Güncelleme İndirme Linki (URL)</label>
                                <input type="url" name="update_url" id="update_url" value="<?= htmlspecialchars($update_url) ?>" placeholder="http://..." required>
                            </div>
                            <button type="submit" class="btn" style="background: var(--accent); color: #fff;">AYARLARI KAYDET 💾</button>
                        </form>
                    </div>
                </div>

                <!-- Sağ Taraf - Lisans Listesi -->
                <div class="right-panel">
                    <div class="card" style="margin-bottom: 0;">
                        <h3>📋 Üretilen Lisanslar (<?= count($licenses) ?>)</h3>
                        <div class="table-container">
                            <?php if (empty($licenses)): ?>
                                <div style="text-align: center; color: var(--muted); padding: 40px 0; font-family: 'Space Mono', monospace;">
                                    Veritabanında henüz kayıtlı lisans anahtarı bulunmuyor.
                                </div>
                            <?php else: ?>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Anahtar (Key)</th>
                                            <th>Durum</th>
                                            <th>Cihaz (Client ID)</th>
                                            <th>Son Kullanma</th>
                                            <th>İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($licenses as $lic): ?>
                                            <?php
                                                // Expiry status check
                                                $isExpired = strtotime($lic['expires_at']) < time();
                                                $displayStatus = $lic['status'];
                                                if ($displayStatus === 'active' && $isExpired) {
                                                    $displayStatus = 'expired';
                                                }
                                            ?>
                                            <tr>
                                                <td class="license-key-cell"><?= htmlspecialchars($lic['license_key']) ?></td>
                                                <td>
                                                    <?php if ($displayStatus === 'active'): ?>
                                                        <span class="badge badge-active">Aktif</span>
                                                    <?php elseif ($displayStatus === 'expired'): ?>
                                                        <span class="badge badge-expired">Süresi Bitti</span>
                                                    <?php else: ?>
                                                        <span class="badge badge-suspended">İptal / Askıda</span>
                                                    <?php endif; ?>
                                                </td>
                                                <td class="client-id-cell" title="<?= htmlspecialchars($lic['client_id'] ?? 'Eşleşmemiş') ?>">
                                                     <?php if ($lic['client_id']): ?>
                                                         <span style="font-weight: 500; color: var(--accent);"><?= htmlspecialchars($lic['client_name'] ?? 'İsimsiz Cihaz') ?></span>
                                                         <span style="font-size: 9px; color: var(--muted); display: block; font-family: 'Space Mono', monospace;">(<?= htmlspecialchars(substr($lic['client_id'], 0, 8)) ?>...)</span>
                                                     <?php else: ?>
                                                         <em>Eşleşmemiş</em>
                                                     <?php endif; ?>
                                                 </td>
                                                <td class="date-cell"><?= date('d.m.Y H:i', strtotime($lic['expires_at'])) ?></td>
                                                <td>
                                                    <div style="display: flex;">
                                                        <?php if ($displayStatus === 'active'): ?>
                                                            <!-- Active: Allow Suspending -->
                                                            <form action="admin.php" method="POST" onsubmit="return confirm('Bu lisansı iptal etmek / askıya almak istediğinize emin misiniz?');">
                                                                <input type="hidden" name="action" value="suspend">
                                                                <input type="hidden" name="id" value="<?= $lic['id'] ?>">
                                                                <button type="submit" class="btn-action btn-suspend" title="Lisansı İptal Et/Askıya Al">İptal Et</button>
                                                            </form>
                                                        <?php else: ?>
                                                            <!-- Suspended/Expired: Allow Activating -->
                                                            <form action="admin.php" method="POST">
                                                                <input type="hidden" name="action" value="activate">
                                                                <input type="hidden" name="id" value="<?= $lic['id'] ?>">
                                                                <button type="submit" class="btn-action btn-activate" title="Lisansı Aktif Et / Süreyi 30 gün uzat">Aktif Et</button>
                                                            </form>
                                                        <?php endif; ?>

                                                        <?php if ($lic['client_id']): ?>
                                                            <!-- Has active binding: Allow resetting device link -->
                                                            <form action="admin.php" method="POST" onsubmit="return confirm('Cihaz bağını sıfırlamak istediğinize emin misiniz? Kullanıcı bu lisansı başka bir bilgisayarda kullanabilir.');">
                                                                <input type="hidden" name="action" value="reset_client">
                                                                <input type="hidden" name="id" value="<?= $lic['id'] ?>">
                                                                <button type="submit" class="btn-action btn-reset-hwid" title="Cihaz Bağını Sıfırla (HWID Reset)">Cihazı Sıfırla</button>
                                                            </form>
                                                        <?php endif; ?>

                                                        <!-- Delete from Database -->
                                                        <form action="admin.php" method="POST" onsubmit="return confirm('Bu lisansı veritabanından tamamen silmek istediğinize emin misiniz? Bu işlem geri alınamaz!');">
                                                            <input type="hidden" name="action" value="delete">
                                                            <input type="hidden" name="id" value="<?= $lic['id'] ?>">
                                                                                </div>
                                                 </td>
                                             </tr>
                                         <?php endforeach; ?>
                                     </tbody>
                                 </table>
                             <?php endif; ?>
                         </div>
                     </div>

                     <div class="card" style="margin-top: 20px;">
                         <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
                             <h3 style="margin-bottom: 0;">👥 Kayıtlı İstemciler (<?= count($clients) ?>)</h3>
                             <input type="text" id="clientSearchInput" placeholder="Cihaz adı veya ID ara..." style="width: 220px; padding: 6px 10px; font-size: 11px; margin: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: 'Space Mono', monospace; outline: none;">
                         </div>
                         <div class="table-container">
                             <?php if (empty($clients)): ?>
                                 <div style="text-align: center; color: var(--muted); padding: 30px 0; font-family: 'Space Mono', monospace;">
                                     Henüz kayıtlı veya aktif istemci bulunmuyor.
                                 </div>
                             <?php else: ?>
                                 <table>
                                     <thead>
                                         <tr>
                                             <th>Cihaz Adı / Etiketi</th>
                                             <th>İstemci (Client ID)</th>
                                             <th>Sıfırlama Durumu</th>
                                             <th>Son Görülme</th>
                                             <th>İşlemler</th>
                                         </tr>
                                     </thead>
                                     <tbody id="clientsTableBody">
                                         <?php foreach ($clients as $client): ?>
                                             <tr>
                                                 <td style="font-weight: bold; color: var(--accent3);">
                                                     <?= htmlspecialchars($client['client_name'] ?? 'İsimsiz Cihaz') ?>
                                                 </td>
                                                 <td class="client-id-cell" style="max-width: 200px;" title="<?= htmlspecialchars($client['client_id']) ?>">
                                                     <?= htmlspecialchars($client['client_id']) ?>
                                                 </td>
                                                 <td>
                                                     <?php if ($client['reset_requested'] == 1): ?>
                                                         <span class="badge badge-expired" style="background: rgba(255, 167, 38, 0.08); border-color: rgba(255, 167, 38, 0.2); color: var(--orange);">Sıfırlama Bekliyor</span>
                                                     <?php else: ?>
                                                         <span class="badge badge-active">Normal</span>
                                                     <?php endif; ?>
                                                 </td>
                                                 <td class="date-cell"><?= date('d.m.Y H:i:s', strtotime($client['updated_at'])) ?></td>
                                                 <td>
                                                     <div style="display: flex;">
                                                         <!-- Reset Limit for Single Client -->
                                                         <form action="admin.php" method="POST" onsubmit="return confirm('Bu istemcinin form limitini sıfırlamak istediğinize emin misiniz?');">
                                                             <input type="hidden" name="action" value="reset_single_limit">
                                                             <input type="hidden" name="id" value="<?= $client['id'] ?>">
                                                             <button type="submit" class="btn-action btn-reset-hwid" title="Sadece Bu İstemcinin Limitini Sıfırla">Limiti Sıfırla</button>
                                                         </form>
 
                                                         <!-- Delete Client Record -->
                                                         <form action="admin.php" method="POST" onsubmit="return confirm('Bu istemciyi listeden silmek istediğinize emin misiniz? (Not: Kullanıcı botu açınca listede otomatik olarak tekrar belirir)');">
                                                             <input type="hidden" name="action" value="delete_client">
                                                             <input type="hidden" name="id" value="<?= $client['id'] ?>">
                                                             <button type="submit" class="btn-action btn-delete" title="İstemciyi Sil">Sil</button>
                                                         </form>
                                                     </div>
                                                 </td>
                                             </tr>
                                         <?php endforeach; ?>
                                     </tbody>
                                 </table>
                             <?php endif; ?>
                         </div>
                    </div>

                    <div class="card" style="margin-top: 20px;">
                        <h3>📥 Destek Talepleri & Ticket Sistemi (<?= count($feedbacks) ?>)</h3>
                        <div class="table-container">
                            <?php if (empty($feedbacks)): ?>
                                <div style="text-align: center; color: var(--muted); padding: 30px 0; font-family: 'Space Mono', monospace;">
                                    Henüz gelen destek talebi bulunmuyor.
                                </div>
                            <?php else: ?>
                                <table>
                                    <thead>
                                        <tr>
                                            <th style="width: 80px;">Durum</th>
                                            <th style="width: 150px;">Gönderen Cihaz</th>
                                            <th style="width: 180px;">Gmail & Tarih</th>
                                            <th>Talep Mesajı & Yönetici Yanıtı</th>
                                            <th style="width: 120px;">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($feedbacks as $fb): ?>
                                            <?php
                                                $status = $fb['status'] ?? 'open';
                                                $statusBadge = '';
                                                if ($status === 'open') {
                                                    $statusBadge = '<span style="color: var(--red); font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: \'Space Mono\', monospace; letter-spacing: 0.3px;">● Açık</span>';
                                                } else if ($status === 'answered') {
                                                    $statusBadge = '<span style="color: var(--green); font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: \'Space Mono\', monospace; letter-spacing: 0.3px;">● Yanıtlandı</span>';
                                                } else if ($status === 'closed') {
                                                    $statusBadge = '<span style="color: var(--muted); font-size: 11px; font-weight: bold; text-transform: uppercase; font-family: \'Space Mono\', monospace; letter-spacing: 0.3px;">● Kapatıldı</span>';
                                                }
                                            ?>
                                             <tr>
                                                 <td>
                                                     <?= $statusBadge ?>
                                                     <?php if (($fb['nudge'] ?? 0) == 1): ?>
                                                         <div style="margin-top: 4px; display: inline-block; font-size: 8px; font-weight: bold; background: rgba(255, 167, 38, 0.1); border: 1px solid var(--orange); color: var(--orange); padding: 1px 4px; border-radius: 2px; text-transform: uppercase; font-family: 'Space Mono', monospace; animation: pulse-orange 1.5s infinite; white-space: nowrap;">🔔 DÜRTÜLDÜ</div>
                                                     <?php endif; ?>
                                                 </td>
                                                <td>
                                                    <?php
                                                    $isPremium = false;
                                                    if (isset($fb['license_status']) && $fb['license_status'] === 'active' && strtotime($fb['license_expires_at']) > time()) {
                                                        $isPremium = true;
                                                    }
                                                    ?>
                                                    <strong style="color: var(--accent);"><?= htmlspecialchars($fb['client_name'] ?? 'İsimsiz Cihaz') ?></strong>
                                                    <?php if ($isPremium): ?>
                                                        <span class="badge badge-active" style="display: inline-block; font-size: 8px; padding: 1px 4px; vertical-align: middle; background: rgba(0, 230, 118, 0.08); border-color: rgba(0, 230, 118, 0.2); color: var(--green); margin-left: 4px;">⭐ VIP Müşteri</span>
                                                    <?php endif; ?>
                                                    <span style="font-size: 9px; color: var(--muted); display: block; font-family: 'Space Mono', monospace;">(<?= htmlspecialchars(substr($fb['client_id'], 0, 8)) ?>...)</span>
                                                </td>
                                                <td>
                                                    <div style="font-weight: bold; font-family: 'Space Mono', monospace; color: var(--text); font-size: 11px;">
                                                        <?= htmlspecialchars($fb['email']) ?>
                                                    </div>
                                                    <div class="date-cell" style="margin-top: 3px; font-size: 10px;">
                                                        <?= date('d.m.Y H:i:s', strtotime($fb['created_at'])) ?>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style="font-weight: 500; font-size: 13px; color: #fff; max-width: 450px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;">
                                                        <?= htmlspecialchars(mb_strimwidth($fb['message'] ?? '', 0, 80, "...")) ?>
                                                    </div>
                                                    <?php
                                                    $fbCleanName = addslashes($fb['client_name'] ?? 'İsimsiz Cihaz');
                                                    $fbEmail = addslashes($fb['email'] ?? '');
                                                    $fbId = intval($fb['id']);
                                                    $isClosedVal = ($status === 'closed') ? 'true' : 'false';
                                                    $vipSuffix = $isPremium ? ' ⭐ VIP Müşteri' : '';
                                                    ?>
                                                    <button type="button" class="btn-action" style="border-color: var(--accent); color: var(--accent); font-weight: bold; background: rgba(124, 106, 255, 0.05); padding: 5px 12px;" onclick="openAdminChat(<?= $fbId ?>, '<?= $fbEmail ?> (<?= $fbCleanName ?>)<?= $vipSuffix ?>', <?= $isClosedVal ?>)">
                                                        💬 Sohbeti Aç / Yanıtla
                                                    </button>
                                                </td>
                                                <td>
                                                    <div style="display: flex; flex-direction: column; gap: 4px;">
                                                        <?php if ($status !== 'closed'): ?>
                                                            <form action="admin.php" method="POST" onsubmit="return confirm('Bu destek talebini kapatmak istediğinize emin misiniz?');" style="display:inline;">
                                                                <input type="hidden" name="action" value="close_feedback">
                                                                <input type="hidden" name="id" value="<?= $fb['id'] ?>">
                                                                <button type="submit" class="btn-action btn-suspend" style="width: 100%; text-align: center;" title="Talebi Kapat">Kapat</button>
                                                            </form>
                                                        <?php endif; ?>
                                                        
                                                        <form action="admin.php" method="POST" onsubmit="return confirm('Bu destek talebini veritabanından tamamen silmek istediğinize emin misiniz?');" style="display:inline;">
                                                            <input type="hidden" name="action" value="delete_feedback">
                                                            <input type="hidden" name="id" value="<?= $fb['id'] ?>">
                                                            <button type="submit" class="btn-action btn-delete" style="width: 100%; text-align: center;" title="Talebi Sil">Sil</button>
                                                        </form>
                                                    </div>
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
             </div>
         </div>
     <?php endif; ?>

     <script>
         document.getElementById('clientSearchInput')?.addEventListener('input', function(e) {
             const query = e.target.value.toLowerCase().trim();
             const rows = document.querySelectorAll('#clientsTableBody tr');
             rows.forEach(row => {
                 const name = row.children[0]?.textContent.toLowerCase() || '';
                 const id = row.children[1]?.textContent.toLowerCase() || '';
                 if (name.includes(query) || id.includes(query)) {
                     row.style.display = '';
                 } else {
                     row.style.display = 'none';
                 }
             });
         });
     </script>
     <?php
     $hasActiveNudges = false;
     foreach ($feedbacks as $fb) {
         if (($fb['nudge'] ?? 0) == 1) {
             $hasActiveNudges = true;
             break;
         }
     }
     ?>
      <!-- Sohbet Modalı (Chat Modal) -->
      <div id="adminChatModal" style="display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.85); align-items: center; justify-content: center; backdrop-filter: blur(5px);">
          <div style="background: var(--surface); border: 1px solid var(--border); border-radius: 12px; width: 90%; max-width: 550px; display: flex; flex-direction: column; height: 80vh; max-height: 600px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); overflow: hidden;">
              <!-- Modal Başlık -->
              <div style="padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: var(--surface2);">
                  <div>
                      <h3 style="margin-bottom: 2px; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: bold; border-left: none; padding-left: 0;" id="modalTicketTitle">Destek Talebi #00</h3>
                      <div style="font-size: 11px; color: var(--muted);" id="modalTicketUser">Kullanıcı: Gmail (Cihaz Etiketi)</div>
                  </div>
                  <button onclick="closeAdminChat()" style="background: transparent; border: none; color: var(--muted); font-size: 24px; cursor: pointer; transition: color 0.2s; line-height: 1;">&times;</button>
              </div>
              
              <!-- Sohbet Mesajları -->
              <div id="modalChatMessages" style="flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: rgba(0, 0, 0, 0.25);">
                  <!-- Balonlar buraya dinamik eklenecek -->
              </div>
              
              <!-- Alt Alan (Yanıt Yazma / Bilgi) -->
              <div style="padding: 15px 20px; border-top: 1px solid var(--border); background: var(--surface2);">
                  <div id="modalChatInputArea" style="display: flex; gap: 10px; align-items: flex-end;">
                      <textarea id="modalChatReplyText" placeholder="Kullanıcıya yanıt yazın... (Göndermek için Enter)" class="admin-reply-textarea" style="height: 38px; resize: none; margin: 0;" required></textarea>
                      <button onclick="sendAdminChatMessage()" class="admin-reply-btn" style="height: 38px;">GÖNDER</button>
                  </div>
                  <div id="modalChatClosedMsg" style="display: none; text-align: center; font-size: 12px; color: var(--muted); padding: 8px; border: 1px dashed var(--border); border-radius: 6px;">
                      🔒 Bu destek talebi kapatılmıştır. Yanıt gönderemezsiniz.
                  </div>
              </div>
          </div>
      </div>

      <script>
          let currentActiveTicketId = null;
          let chatInterval = null;
          let lastMessageCount = 0;

          function openAdminChat(ticketId, userDetail, isClosed) {
              currentActiveTicketId = ticketId;
              lastMessageCount = 0;
              document.getElementById('modalTicketTitle').textContent = `Destek Talebi #${ticketId}`;
              document.getElementById('modalTicketUser').textContent = `Kullanıcı: ${userDetail}`;
              
              if (isClosed) {
                  document.getElementById('modalChatInputArea').style.display = 'none';
                  document.getElementById('modalChatClosedMsg').style.display = 'block';
              } else {
                  document.getElementById('modalChatInputArea').style.display = 'flex';
                  document.getElementById('modalChatClosedMsg').style.display = 'none';
              }
              
              const modal = document.getElementById('adminChatModal');
              modal.style.display = 'flex';
              
              loadAdminChatMessages(ticketId);
              
              if (chatInterval) clearInterval(chatInterval);
              chatInterval = setInterval(() => {
                  if (currentActiveTicketId === ticketId) {
                      loadAdminChatMessages(ticketId, true);
                  }
              }, 3000);
          }

          function closeAdminChat() {
              currentActiveTicketId = null;
              if (chatInterval) {
                  clearInterval(chatInterval);
                  chatInterval = null;
              }
              document.getElementById('adminChatModal').style.display = 'none';
              location.reload();
          }

          function loadAdminChatMessages(ticketId, silent = false) {
              fetch(`admin.php?ajax=1&action=get_chat&ticket_id=${ticketId}`)
                  .then(res => res.json())
                  .then(data => {
                      if (data.status === 'success') {
                          const container = document.getElementById('modalChatMessages');
                          const messages = data.messages;
                          
                          if (silent && messages.length === lastMessageCount) {
                              return;
                          }
                          
                          lastMessageCount = messages.length;
                          container.innerHTML = '';
                          
                          const isPremium = data.ticket.license_status === 'active' && new Date(data.ticket.license_expires_at) > new Date();
                          
                          messages.forEach(msg => {
                              const bubble = document.createElement('div');
                              bubble.className = `modal-chat-bubble ${msg.sender}`;
                              
                              if (msg.sender === 'user' && isPremium) {
                                  bubble.style.borderColor = 'var(--orange)';
                                  bubble.style.boxShadow = '0 0 8px rgba(255, 167, 38, 0.15)';
                              }
                              
                              const text = document.createElement('div');
                              text.textContent = (msg.sender === 'user' && isPremium ? '⭐ ' : '') + msg.message;
                              text.style.whiteSpace = 'pre-wrap';
                              
                              const time = document.createElement('span');
                              time.className = 'modal-chat-bubble-time';
                              const dateObj = new Date(msg.created_at);
                              time.textContent = dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                              
                              bubble.appendChild(text);
                              bubble.appendChild(time);
                              container.appendChild(bubble);
                          });
                          
                          container.scrollTop = container.scrollHeight;
                      }
                  })
                  .catch(err => console.error('Hata:', err));
          }

          function sendAdminChatMessage() {
              const textarea = document.getElementById('modalChatReplyText');
              const message = textarea.value.trim();
              if (!message || !currentActiveTicketId) return;
              
              const formData = new FormData();
              formData.append('ticket_id', currentActiveTicketId);
              formData.append('message', message);
              
              fetch('admin.php?ajax=1&action=send_message', {
                  method: 'POST',
                  body: formData
              })
              .then(res => res.json())
              .then(data => {
                  if (data.status === 'success') {
                      textarea.value = '';
                      loadAdminChatMessages(currentActiveTicketId);
                  } else {
                      alert('Hata: ' + data.message);
                  }
              })
              .catch(err => {
                  console.error('Gönderim hatası:', err);
                  alert('Bağlantı hatası!');
              });
          }

          document.getElementById('modalChatReplyText')?.addEventListener('keydown', function(e) {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendAdminChatMessage();
              }
          });
      </script>
     <?php if ($hasActiveNudges): ?>
     <script>
         const originalTitle = document.title;
         setInterval(() => {
             document.title = document.title === originalTitle ? "🔔 YENİ UYARI (DÜRTME)!" : originalTitle;
         }, 1000);
     </script>
     <?php endif; ?>
 </body>
 </html>
