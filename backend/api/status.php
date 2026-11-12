<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = require_staff();
require_post();

$data = api_body();

$id = positive_id($data['id'] ?? null);
$requestedStatus = text_value($data, 'statusCode', 30);

$transitions = [
    'transaction' => [
        'pending' => ['processing', 'cancelled'],
        'processing' => ['completed', 'cancelled'],
        'completed' => [],
        'cancelled' => []
    ],
    'request' => [
        'pending' => ['in_progress', 'cancelled'],
        'in_progress' => ['resolved', 'cancelled'],
        'resolved' => [],
        'cancelled' => []
    ],
    'received' => [
        'received' => ['under_review', 'returned'],
        'under_review' => ['filed', 'returned'],
        'filed' => [],
        'returned' => []
    ]
];

$conn->begin_transaction();

try {
    $record = record_row($id, true);

    if ($record['deleted_at'] !== null) {
        throw new DomainException('This record has been deleted.');
    }

    $allowed = $transitions[$record['record_type']]
        [$record['status_code']] ?? [];

    /*
     * Omitting statusCode advances to the normal next status.
     */
    $next = $requestedStatus !== ''
        ? $requestedStatus
        : ($allowed[0] ?? '');

    if ($next === '' || !in_array($next, $allowed, true)) {
        throw new DomainException(
            'This status transition is not allowed.'
        );
    }

    $label = db_one(
        'SELECT label FROM record_statuses
         WHERE record_type = ? AND code = ?',
        'ss',
        [$record['record_type'], $next]
    );

    if (!$label) {
        throw new DomainException('Invalid status.');
    }

    db_query(
        'UPDATE service_records
         SET status_code = ?, updated_by = ?
         WHERE id = ?',
        'sii',
        [$next, (int) $user['id'], $id]
    );

    history_add(
        $id,
        (int) $user['id'],
        'status_changed',
        'Status changed to ' . $label['label'] . '.',
        $record['status_code'],
        $next
    );

    $conn->commit();

} catch (Throwable $exception) {
    $conn->rollback();

    if ($exception instanceof DomainException) {
        api_fail($exception->getMessage());
    }

    throw $exception;
}

api_json([
    'ok' => true,
    'message' => 'Status updated.',
    'record' => formatted_record($id)
]);