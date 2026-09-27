<?php
header('Content-Type: application/json; charset=utf-8');
require __DIR__ . '/config/database.php';
try {
    $pdo->query('SELECT 1');
    echo json_encode(['status' => 'ok', 'app' => 'Adrian Laptop KP', 'database' => 'connected']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'database' => 'disconnected']);
}
