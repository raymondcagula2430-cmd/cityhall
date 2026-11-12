<?php

declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

$user = require_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id'])) {
        $id = positive_id($_GET['id']);
        $record = record_row($id);

        if (!can_view_record($user, $record)) {
            api_fail('You cannot access this record.', 403);
        }

        if ($record['deleted_at'] !== null) {
            api_fail('Record not found.', 404);
        }

        api_json([
            'ok' => true,
            'record' => formatted_record($id)
        ]);
    }

    $sql = 'SELECT id FROM service_records WHERE deleted_at IS NULL';
    $types = '';
    $args = [];

    if (!staff_user($user)) {
        $sql .= ' AND owner_user_id = ?';
        $types .= 'i';
        $args[] = (int) $user['id'];
    }

    if (isset($_GET['type']) && $_GET['type'] !== '') {
        $type = valid_type($_GET['type']);
        $sql .= ' AND record_type = ?';
        $types .= 's';
        $args[] = $type;
    }

    /*
     * Bounded retrieval for the initial frontend.
     * A larger deployment should use server-side pagination.
     */
    $sql .= ' ORDER BY created_at DESC, id DESC LIMIT 500';

    $rows = db_rows($sql, $types, $args);

    $result = [];

    foreach ($rows as $row) {
        $result[] = formatted_record((int) $row['id']);
    }

    api_json([
        'ok' => true,
        'records' => $result,
        'limit' => 500
    ]);
}

require_post();

$data = api_body();
$action = $data['action'] ?? '';

if ($action === 'reorder') {
    require_staff();

    $ids = $data['ids'] ?? [];

    if (!is_array($ids) || !$ids || count($ids) > 500) {
        api_fail('Provide between 1 and 500 record IDs.');
    }

    $ids = array_map('positive_id', $ids);

    if (count(array_unique($ids)) !== count($ids)) {
        api_fail('Duplicate record IDs are not allowed.');
    }

    $conn->begin_transaction();

    try {
        $recordType = null;

        foreach ($ids as $id) {
            $record = record_row($id, true);

            if ($record['deleted_at'] !== null) {
                throw new DomainException('A selected record was deleted.');
            }

            $recordType ??= $record['record_type'];

            if ($record['record_type'] !== $recordType) {
                throw new DomainException(
                    'Only reorder records of the same type.'
                );
            }
        }

        foreach ($ids as $position => $id) {
            db_query(
                'UPDATE service_records
                 SET sort_order = ?, updated_by = ?
                 WHERE id = ?',
                'iii',
                [$position, (int) $user['id'], $id]
            );
        }

        $conn->commit();

    } catch (Throwable $exception) {
        $conn->rollback();

        if ($exception instanceof DomainException) {
            api_fail($exception->getMessage());
        }

        throw $exception;
    }

    api_json(['ok' => true, 'message' => 'Order saved.']);
}

if ($action === 'create') {
    $type = valid_type($data['type'] ?? null);

    if (!staff_user($user) && $type !== 'request') {
        api_fail('Residents can submit service requests only.', 403);
    }

    $values = validate_record_fields($data, $type, $user);

    $status = $type === 'received' ? 'received' : 'pending';

    $ownerId = (int) $user['id'];

    if (staff_user($user)) {
        $ownerId = nullable_id($data['ownerId'] ?? null);

        if (
            $ownerId !== null
            && !db_one(
                "SELECT id FROM users
                 WHERE id = ? AND role = 'resident' AND is_active = 1",
                'i',
                [$ownerId]
            )
        ) {
            api_fail('Select an active resident account.');
        }
    }

    $reference = 'QC-'
        . strtoupper(substr($type, 0, 2))
        . '-'
        . strtoupper(bin2hex(random_bytes(8)));

    $conn->begin_transaction();

    try {
        db_query(
            'INSERT INTO service_records
                (
                    reference_no,
                    record_type,
                    category_id,
                    title,
                    person_name,
                    person_email,
                    record_date,
                    barangay_id,
                    status_code,
                    priority,
                    amount,
                    payment_method,
                    received_through,
                    location,
                    notes,
                    owner_user_id,
                    created_by
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            'ssissssisssssssii',
            [
                $reference,
                $type,
                $values['categoryId'],
                $values['title'],
                $values['name'],
                $values['email'],
                $values['date'],
                $values['barangayId'],
                $status,
                $values['priority'],
                $values['amount'],
                $values['method'],
                $values['source'],
                $values['location'],
                $values['notes'],
                $ownerId,
                (int) $user['id']
            ]
        );

        $id = (int) $conn->insert_id;

        db_query(
            'UPDATE service_records SET sort_order = ? WHERE id = ?',
            'ii',
            [$id, $id]
        );

        history_add(
            $id,
            (int) $user['id'],
            'created',
            'Record created.',
            null,
            $status
        );

        $conn->commit();

    } catch (Throwable $exception) {
        $conn->rollback();
        throw $exception;
    }

    api_json([
        'ok' => true,
        'message' => 'Record created.',
        'record' => formatted_record($id)
    ], 201);
}

if (!in_array($action, ['update', 'delete', 'restore'], true)) {
    api_fail('Invalid record action.');
}

$id = positive_id($data['id'] ?? null);

/*
 * Validate editable fields before starting the transaction.
 * The record itself is locked and permissions rechecked below.
 */
$initial = record_row($id);

if (!can_edit_record($user, $initial)) {
    api_fail('You cannot modify this record.', 403);
}

$values = $action === 'update'
    ? validate_record_fields($data, $initial['record_type'], $user)
    : null;

$conn->begin_transaction();

try {
    $record = record_row($id, true);

    if (!can_edit_record($user, $record)) {
        throw new DomainException('You cannot modify this record.');
    }

    if ($action === 'restore') {
        if (!staff_user($user)) {
            throw new DomainException('Only staff can restore records.');
        }

        if ($record['deleted_at'] === null) {
            throw new DomainException('This record is not deleted.');
        }

        db_query(
            'UPDATE service_records
             SET deleted_at = NULL,
                 deleted_by = NULL,
                 updated_by = ?
             WHERE id = ?',
            'ii',
            [(int) $user['id'], $id]
        );

        history_add(
            $id,
            (int) $user['id'],
            'restored',
            'Record restored.'
        );

    } else {
        if ($record['deleted_at'] !== null) {
            throw new DomainException('This record has been deleted.');
        }

        if ($action === 'delete') {
            db_query(
                'UPDATE service_records
                 SET deleted_at = NOW(),
                     deleted_by = ?,
                     updated_by = ?
                 WHERE id = ?',
                'iii',
                [(int) $user['id'], (int) $user['id'], $id]
            );

            history_add(
                $id,
                (int) $user['id'],
                'deleted',
                'Record deleted.'
            );

        } else {
            db_query(
                'UPDATE service_records
                 SET category_id = ?,
                     title = ?,
                     person_name = ?,
                     person_email = ?,
                     record_date = ?,
                     barangay_id = ?,
                     priority = ?,
                     amount = ?,
                     payment_method = ?,
                     received_through = ?,
                     location = ?,
                     notes = ?,
                     updated_by = ?
                 WHERE id = ?',
                'issssissssssii',
                [
                    $values['categoryId'],
                    $values['title'],
                    $values['name'],
                    $values['email'],
                    $values['date'],
                    $values['barangayId'],
                    $values['priority'],
                    $values['amount'],
                    $values['method'],
                    $values['source'],
                    $values['location'],
                    $values['notes'],
                    (int) $user['id'],
                    $id
                ]
            );

            history_add(
                $id,
                (int) $user['id'],
                'updated',
                'Record details updated.'
            );
        }
    }

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
    'message' => 'Record ' . (
        $action === 'delete'
            ? 'deleted.'
            : ($action === 'restore' ? 'restored.' : 'updated.')
    ),
    'record' => $action === 'delete'
        ? null
        : formatted_record($id)
]);