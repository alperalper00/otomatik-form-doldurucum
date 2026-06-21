<?php
// feedback.php - Support Ticket System API
require_once 'db.php';

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Geçersiz istek yöntemi.']);
    exit();
}

// Read JSON input
$input = json_decode(file_get_contents('php://input'), true);

$action = isset($input['action']) ? trim($input['action']) : 'create';
$client_id = isset($input['client_id']) ? trim($input['client_id']) : 'unknown';

try {
    // Ensure feedback table exists with ticket system columns
    $pdo->exec("CREATE TABLE IF NOT EXISTS `feedback` (
      `id` INT AUTO_INCREMENT PRIMARY KEY,
      `client_id` VARCHAR(128) NOT NULL,
      `email` VARCHAR(255) NOT NULL,
      `message` TEXT NULL,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // Add reply, status, and nudge columns if they do not exist
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

    // Auto-migrate legacy ticket data to ticket_messages table
    try {
        $stmt = $pdo->query("SELECT id, message, reply FROM feedback");
        $all_tickets = $stmt->fetchAll();
        foreach ($all_tickets as $t) {
            $check = $pdo->prepare("SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = ?");
            $check->execute([$t['id']]);
            if ($check->fetchColumn() == 0) {
                // If it is a legacy ticket, create messages out of message and reply
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

    if ($action === 'list') {
        // Retrieve tickets for the specific client
        $stmt = $pdo->prepare("SELECT id, email, status, nudge, created_at FROM feedback WHERE client_id = ? ORDER BY created_at DESC");
        $stmt->execute([$client_id]);
        $tickets = $stmt->fetchAll();

        // Load the chat history messages for each ticket
        foreach ($tickets as &$ticket) {
            $msgStmt = $pdo->prepare("SELECT sender, message, created_at FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC");
            $msgStmt->execute([$ticket['id']]);
            $ticket['messages'] = $msgStmt->fetchAll();
        }

        echo json_encode(['status' => 'success', 'tickets' => $tickets]);
        exit();
    } else if ($action === 'nudge') {
        $ticket_id = isset($input['ticket_id']) ? intval($input['ticket_id']) : 0;
        if ($ticket_id <= 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Geçersiz parametreler.']);
            exit();
        }
        $stmt = $pdo->prepare("UPDATE feedback SET nudge = 1 WHERE id = ? AND client_id = ?");
        $stmt->execute([$ticket_id, $client_id]);
        echo json_encode(['status' => 'success', 'message' => 'Yöneticiye bildirim gönderildi.']);
        exit();
    } else if ($action === 'client_reply') {
        $ticket_id = isset($input['ticket_id']) ? intval($input['ticket_id']) : 0;
        $reply_text = isset($input['reply_text']) ? trim($input['reply_text']) : '';

        if ($ticket_id <= 0 || empty($reply_text)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Geçersiz parametreler.']);
            exit();
        }

        // Fetch current ticket
        $stmt = $pdo->prepare("SELECT status FROM feedback WHERE id = ? AND client_id = ?");
        $stmt->execute([$ticket_id, $client_id]);
        $ticket = $stmt->fetch();

        if (!$ticket) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => 'Talep bulunamadı.']);
            exit();
        }

        if ($ticket['status'] === 'closed') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Bu talep kapatılmış olduğundan yanıt veremezsiniz.']);
            exit();
        }

        // Insert new message
        $stmt = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message) VALUES (?, 'user', ?)");
        $stmt->execute([$ticket_id, $reply_text]);

        // Reset status to open (meaning user responded, waiting for admin) and clear old reply field
        $stmt = $pdo->prepare("UPDATE feedback SET reply = NULL, status = 'open' WHERE id = ?");
        $stmt->execute([$ticket_id]);

        echo json_encode(['status' => 'success', 'message' => 'Yanıtınız gönderildi.']);
        exit();
    } else {
        // Action: Create ticket
        $email = isset($input['email']) ? trim($input['email']) : '';
        $message = isset($input['message']) ? trim($input['message']) : '';

        if (empty($email) || empty($message)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'E-posta ve mesaj alanları boş bırakılamaz.']);
            exit();
        }

        // Email domain verification
        $parts = explode('@', $email);
        $domain = isset($parts[1]) ? strtolower(trim($parts[1])) : '';
        $allowedDomains = [
            'gmail.com',
            'outlook.com',
            'outlook.com.tr',
            'hotmail.com',
            'hotmail.com.tr',
            'yahoo.com',
            'yandex.com',
            'yandex.com.tr',
            'live.com',
            'windowslive.com',
            'icloud.com'
        ];

        if (!in_array($domain, $allowedDomains)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Yalnızca genel e-posta sağlayıcıları (gmail, hotmail, outlook, yandex vb.) kabul edilmektedir.']);
            exit();
        }

        // Insert ticket into feedback metadata
        $stmt = $pdo->prepare("INSERT INTO feedback (client_id, email, message, status) VALUES (?, ?, ?, 'open')");
        $stmt->execute([$client_id, $email, $message]);
        $ticket_id = $pdo->lastInsertId();

        // Save the first message to messages list
        $stmt = $pdo->prepare("INSERT INTO ticket_messages (ticket_id, sender, message) VALUES (?, 'user', ?)");
        $stmt->execute([$ticket_id, $message]);

        echo json_encode(['status' => 'success', 'message' => 'Destek talebiniz başarıyla oluşturuldu.']);
        exit();
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Veritabanı hatası oluştu: ' . $e->getMessage()]);
    exit();
}
