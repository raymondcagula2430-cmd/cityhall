<?php

declare(strict_types=1);

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$localFile = __DIR__ . '/db.local.php';

$local = is_file($localFile)
    ? require $localFile
    : [];

if (!is_array($local)) {
    throw new RuntimeException(
        'Invalid local database configuration.'
    );
}

function db_setting(
    string $environmentName,
    array $local,
    string $localKey,
    ?string $default = null
): ?string {
    $environmentValue = getenv($environmentName);

    if ($environmentValue !== false) {
        return $environmentValue;
    }

    if (array_key_exists($localKey, $local)) {
        return (string) $local[$localKey];
    }

    return $default;
}

$dbHost = db_setting('DB_HOST', $local, 'host');
$dbName = db_setting('DB_NAME', $local, 'database');
$dbUser = db_setting('DB_USER', $local, 'username');
$dbPassword = db_setting('DB_PASSWORD', $local, 'password');
$dbPort = (int) db_setting('DB_PORT', $local, 'port', '3306');

if (
    !$dbHost
    || !$dbName
    || !$dbUser
    || $dbPassword === null
) {
    throw new RuntimeException(
        'Database configuration is missing.'
    );
}

$conn = new mysqli(
    $dbHost,
    $dbUser,
    $dbPassword,
    $dbName,
    $dbPort
);

$conn->set_charset('utf8mb4');