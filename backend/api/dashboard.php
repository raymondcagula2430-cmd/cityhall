<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = require_user();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    api_fail('Use GET for dashboard data.', 405);
}

$scope = 'r.deleted_at IS NULL';
$types = '';
$args = [];

if (!staff_user($user)) {
    $scope .= ' AND r.owner_user_id = ?';
    $types = 'i';
    $args[] = (int) $user['id'];
}

$stats = db_one(
    "SELECT
        COALESCE(SUM(r.record_type = 'transaction'), 0)
            AS transactions,

        COALESCE(SUM(
            r.record_type = 'request'
            AND r.status_code NOT IN ('resolved', 'cancelled')
        ), 0) AS open_requests,

        COALESCE(SUM(r.record_type = 'received'), 0)
            AS documents,

        COALESCE(SUM(
            CASE
                WHEN r.record_type = 'transaction'
                 AND r.status_code = 'completed'
                THEN r.amount
                ELSE 0
            END
        ), 0) AS collections
     FROM service_records r
     WHERE {$scope}",
    $types,
    $args
);

$collections = db_rows(
    "SELECT
        c.name AS label,
        SUM(r.amount) AS value
     FROM service_records r
     JOIN categories c ON c.id = r.category_id
     WHERE {$scope}
       AND r.record_type = 'transaction'
       AND r.status_code = 'completed'
     GROUP BY c.id, c.name
     ORDER BY value DESC
     LIMIT 5",
    $types,
    $args
);

$barangays = db_rows(
    "SELECT
        COALESCE(b.name, 'Other / Not listed') AS label,
        COUNT(*) AS value
     FROM service_records r
     LEFT JOIN barangays b ON b.id = r.barangay_id
     WHERE {$scope}
       AND r.record_type = 'request'
       AND r.status_code NOT IN ('resolved', 'cancelled')
     GROUP BY b.id, b.name
     ORDER BY value DESC
     LIMIT 5",
    $types,
    $args
);

$recentIds = db_rows(
    "SELECT r.id
     FROM service_records r
     WHERE {$scope}
     ORDER BY r.updated_at DESC, r.id DESC
     LIMIT 6",
    $types,
    $args
);

$recent = [];

foreach ($recentIds as $row) {
    $recent[] = formatted_record((int) $row['id']);
}

api_json([
    'ok' => true,
    'stats' => [
        'transactions' => (int) $stats['transactions'],
        'openRequests' => (int) $stats['open_requests'],
        'documents' => (int) $stats['documents'],
        'collections' => $stats['collections']
    ],
    'collectionsChart' => $collections,
    'barangayChart' => $barangays,
    'recent' => $recent
]);