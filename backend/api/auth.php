<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    api_json([
        'ok' => true,
        'user' => current_user(),
        'csrf' => csrf_token(),
        'lookups' => [
            'barangays' => db_rows(
                'SELECT id, name
                 FROM barangays
                 WHERE is_active = 1
                 ORDER BY name'
            ),
            'categories' => db_rows(
                'SELECT id, record_type AS type, name
                 FROM categories
                 WHERE is_active = 1
                 ORDER BY name'
            ),
            'statuses' => db_rows(
                'SELECT
                    record_type AS type,
                    code,
                    label,
                    sort_order,
                    is_terminal
                 FROM record_statuses
                 ORDER BY record_type, sort_order'
            )
        ]
    ]);
}

require_post();

$data = api_body();
$action = $data['action'] ?? '';

if ($action === 'register') {
    $name = text_value($data, 'name', 100, true);
    $email = strtolower(text_value($data, 'email', 150, true));

    $password = $data['password'] ?? '';

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        api_fail('Enter a valid email address.');
    }

    if (
        !is_string($password)
        || strlen($password) < 12
        || strlen($password) > 72
    ) {
        api_fail('Use a password between 12 and 72 bytes.');
    }

    $barangayId = nullable_id($data['barangayId'] ?? null);

    if (
        $barangayId !== null
        && !db_one(
            'SELECT id FROM barangays
             WHERE id = ? AND is_active = 1',
            'i',
            [$barangayId]
        )
    ) {
        api_fail('Select a valid barangay.');
    }

    if (db_one(
        'SELECT id FROM users WHERE email = ?',
        's',
        [$email]
    )) {
        api_fail('This email address is already registered.', 409);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);

    try {
        db_query(
            "INSERT INTO users
                (
                    full_name,
                    email,
                    password_hash,
                    role,
                    barangay_id
                )
             VALUES (?, ?, ?, 'resident', ?)",
            'sssi',
            [$name, $email, $hash, $barangayId]
        );
    } catch (mysqli_sql_exception $exception) {
        if ((int) $exception->getCode() === 1062) {
            api_fail('This email address is already registered.', 409);
        }

        throw $exception;
    }

    api_json([
        'ok' => true,
        'message' => 'Account created. You can now sign in.'
    ], 201);
}

if ($action === 'login') {
    /*
     * Basic per-session throttling for local development.
     * Production needs server-side IP/account rate limiting too.
     */
    $attempts = $_SESSION['qc_login_attempts'] ?? [
        'count' => 0,
        'started' => time()
    ];

    if (time() - (int) $attempts['started'] > 900) {
        $attempts = ['count' => 0, 'started' => time()];
    }

    if ((int) $attempts['count'] >= 10) {
        api_fail('Too many attempts. Try again later.', 429);
    }

    $email = strtolower(text_value($data, 'email', 150, true));
    $password = $data['password'] ?? '';

    if (!is_string($password) || strlen($password) > 1024) {
        api_fail('Invalid email or password.', 401);
    }

    $account = db_one(
        'SELECT id, password_hash, is_active
         FROM users WHERE email = ?',
        's',
        [$email]
    );

    /*
     * A valid fixed hash is used for the missing-user path,
     * avoiding an immediate return before password verification.
     */
    $fallbackHash =
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi';

    $validPassword = password_verify(
        $password,
        $account['password_hash'] ?? $fallbackHash
    );

    if (
        !$account
        || !$validPassword
        || (int) $account['is_active'] !== 1
    ) {
        $attempts['count']++;
        $_SESSION['qc_login_attempts'] = $attempts;

        api_fail('Invalid email or password.', 401);
    }

    if (password_needs_rehash(
        $account['password_hash'],
        PASSWORD_DEFAULT
    )) {
        db_query(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            'si',
            [
                password_hash($password, PASSWORD_DEFAULT),
                (int) $account['id']
            ]
        );
    }

    session_regenerate_id(true);

    $_SESSION['qc_user_id'] = (int) $account['id'];
    $_SESSION['qc_csrf'] = bin2hex(random_bytes(32));
    unset($_SESSION['qc_login_attempts']);

    db_query(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        'i',
        [(int) $account['id']]
    );

    api_json([
        'ok' => true,
        'message' => 'Signed in successfully.',
        'user' => current_user(),
        'csrf' => csrf_token()
    ]);
}

if ($action === 'logout') {
    $_SESSION = [];

    session_regenerate_id(true);

    api_json([
        'ok' => true,
        'message' => 'Signed out.',
        'user' => null,
        'csrf' => csrf_token()
    ]);
}

api_fail('Invalid authentication action.');