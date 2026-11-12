<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = require_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $views = db_rows(
        'SELECT
            id,
            record_type AS type,
            name,
            search_text AS search,
            status_code AS statusCode,
            category_id AS categoryId,
            barangay_id AS barangayId,
            sort_mode AS sort
         FROM saved_views
         WHERE user_id = ?
         ORDER BY name',
        'i',
        [(int) $user['id']]
    );

    api_json([
        'ok' => true,
        'views' => $views
    ]);
}

require_post();

$data = api_body();
$action = $data['action'] ?? '';

if ($action === 'delete') {
    $id = positive_id($data['id'] ?? null);

    db_query(
        'DELETE FROM saved_views
         WHERE id = ? AND user_id = ?',
        'ii',
        [$id, (int) $user['id']]
    );

    api_json([
        'ok' => true,
        'message' => 'Saved view removed.'
    ]);
}

if ($action !== 'create') {
    api_fail('Invalid saved-view action.');
}

$type = valid_type($data['type'] ?? null);
$name = text_value($data, 'name', 40, true);
$search = text_value($data, 'search', 200);
$statusCode = text_value($data, 'statusCode', 30);
$statusCode = $statusCode !== '' ? $statusCode : null;

$categoryId = nullable_id($data['categoryId'] ?? null);
$barangayId = nullable_id($data['barangayId'] ?? null);
$sort = $data['sort'] ?? 'newest';

if (!in_array(
    $sort,
    ['newest', 'oldest', 'name', 'amount', 'custom'],
    true
)) {
    api_fail('Invalid sorting option.');
}

if (
    $statusCode !== null
    && !db_one(
        'SELECT code FROM record_statuses
         WHERE record_type = ? AND code = ?',
        'ss',
        [$type, $statusCode]
    )
) {
    api_fail('Invalid status filter.');
}

if (
    $categoryId !== null
    && !db_one(
        'SELECT id FROM categories
         WHERE id = ? AND record_type = ? AND is_active = 1',
        'is',
        [$categoryId, $type]
    )
) {
    api_fail('Invalid category filter.');
}

if (
    $barangayId !== null
    && !db_one(
        'SELECT id FROM barangays
         WHERE id = ? AND is_active = 1',
        'i',
        [$barangayId]
    )
) {
    api_fail('Invalid barangay filter.');
}

try {
    db_query(
        'INSERT INTO saved_views
            (
                user_id,
                record_type,
                name,
                search_text,
                status_code,
                category_id,
                barangay_id,
                sort_mode
            )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        'issssiis',
        [
            (int) $user['id'],
            $type,
            $name,
            $search,
            $statusCode,
            $categoryId,
            $barangayId,
            $sort
        ]
    );

} catch (mysqli_sql_exception $exception) {
    if ((int) $exception->getCode() === 1062) {
        api_fail(
            'A saved view with this name already exists for this page.',
            409
        );
    }

    throw $exception;
}

api_json([
    'ok' => true,
    'message' => 'View saved.',
    'id' => (int) $conn->insert_id
], 201);