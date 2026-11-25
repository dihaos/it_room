<?php

declare(strict_types=1);

namespace ITRoom;

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function field(array $input, string $key): string
{
    $value = $input[$key] ?? null;
    return is_string($value) ? preg_replace('/^[\s\x{FEFF}]+|[\s\x{FEFF}]+$/u', '', $value) : '';
}

function invalidText(string $value, int $limit): bool
{
    $length = strlen(mb_convert_encoding($value, 'UTF-16LE', 'UTF-8')) / 2;
    return $length > $limit || preg_match('/[\p{Cc}\p{Cf}]/u', $value) === 1;
}

function validContact(string $value): bool
{
    if (preg_match('~^(?:@|(?:https?://)?t\.me/)[a-z0-9][a-z0-9_]{0,31}/?$~iD', $value)) {
        return true;
    }
    $digits = strlen(preg_replace('/[^0-9]/', '', $value));
    return $digits >= 7 && $digits <= 15 && preg_match('/^\+?[0-9\s().-]+$/uD', $value) === 1;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    reply(405, ['message' => 'Используйте метод POST.']);
}

$invalidJson = ['message' => 'Отправьте данные формы в формате JSON.'];
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
if ($contentType !== 'application/json') {
    reply(400, $invalidJson);
}
$rawBody = file_get_contents('php://input', false, null, 0, 4097);
if ($rawBody === false) {
    reply(400, $invalidJson);
}
if (strlen($rawBody) > 4096) {
    reply(413, ['message' => 'Данные заявки слишком длинные.']);
}
try {
    $input = json_decode($rawBody, true, 32, JSON_THROW_ON_ERROR);
} catch (\JsonException $error) {
    reply(400, $invalidJson);
}
if (!is_array($input)) {
    reply(400, $invalidJson);
}

$groups = ['men' => 'Мужская', 'women' => 'Женская', 'children' => 'Детская'];
$formats = ['online' => 'Онлайн', 'offline' => 'Офлайн'];
$name = field($input, 'name');
$contact = field($input, 'contact');
$group = field($input, 'group');
$format = field($input, 'format');
$forChild = $group === 'children';
$errors = [];

if ($name === '') {
    $errors['name'] = $forChild ? 'Укажите имя родителя.' : 'Укажите ваше имя.';
} elseif (invalidText($name, 80) || !preg_match('/\p{L}/u', $name)) {
    $errors['name'] = 'Введите имя буквами. Максимум 80 символов.';
}
if ($contact === '') {
    $errors['contact'] = $forChild ? 'Укажите контакт родителя.' : 'Укажите телефон или Telegram.';
} elseif (invalidText($contact, 100) || !validContact($contact)) {
    $errors['contact'] = 'Введите номер телефона или Telegram в формате @имя_пользователя.';
}
if (!isset($groups[$group])) {
    $errors['group'] = 'Выберите группу.';
}
if (!isset($formats[$format])) {
    $errors['format'] = 'Выберите предпочтительный формат.';
}
if ($errors) {
    reply(400, ['message' => 'Проверьте поля формы.', 'errors' => $errors]);
}

$sendError = ['message' => 'Не удалось отправить заявку. Попробуйте ещё раз.'];
$configPath = dirname(__DIR__, 2) . '/.itroomschool-telegram.php';
$config = is_readable($configPath) ? require $configPath : [];
$botToken = trim((string) ($config['bot_token'] ?? ''));
$chatId = trim((string) ($config['chat_id'] ?? ''));
if (!preg_match('/^[0-9]+:[A-Za-z0-9_-]+$/D', $botToken) || $chatId === '') {
    reply(503, $sendError);
}

$text = implode("\n", [
    'Новая заявка на курс IT Room',
    ($forChild ? 'Имя родителя' : 'Имя') . ': ' . $name,
    ($forChild ? 'Контакт родителя' : 'Контакт') . ': ' . $contact,
    'Группа: ' . $groups[$group],
    'Формат: ' . $formats[$format],
]);
$request = curl_init('https://api.telegram.org/bot' . $botToken . '/sendMessage');
curl_setopt_array($request, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['chat_id' => $chatId, 'text' => $text], JSON_THROW_ON_ERROR),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V6,
    CURLOPT_CONNECTTIMEOUT => 4,
    CURLOPT_TIMEOUT => 8,
]);
$response = curl_exec($request);
$status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);
$result = is_string($response) ? json_decode($response, true) : null;
if ($status < 200 || $status >= 300 || ($result['ok'] ?? false) !== true) {
    reply(502, $sendError);
}
reply(201, ['ok' => true]);
