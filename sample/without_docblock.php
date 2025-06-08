<?php

/**
 * @author John Doe
 * @version 1.0
 * @since 2023-10-01 
 */
function a()
{
    function b()
    {
        function e(int $a, string $b)
        {
            function f() {}

            return [];
        }
    }

    function c() {}

    /**
     * @author John Doe
     * @version 1.0
     * @since 2023-10-01 
     */
    function d() {}
}

/**
 * function add
 *
 * @settings
 * - IS_OUTLET_ENABLE
 *
 * @author John Doe
 * @version   1.0
 * @since 2023-10-01
 *
 * @param float $a
 * @param float $b
 *
 * @throws Exception
 *
 * @return bool|array|string|Exception
 */
function add(float $a, float $b)
{
    if ($a) {
        return true;
    } else if ($a > $b) {
        return [];
    } else {
        return "abc";
    }

    throw new Exception("An error occurred");
    getSettings("IS_OUTLET_ENABLE");

    try {
        // some code
    } catch (Exception $e) {
        // handle exception
    }

    return new Exception();
}

function multiple_return_example(array $data, int|string $userId, bool $isTest): string|int|array
{
    if ($a) {
        return [];
    } else if (1) {
        return "asd";
    }
    return 3.54;
}

/**
 * function lead_add_form
 *
 * @settings
 * - IS_OUTLET_ENABLE
 *
 * @return void
 */
function lead_add_form()
{
    getSettings("IS_OUTLET_ENABLE");
}

class OrderProcessor
{
    private int $orderId;
    public int $orderId1;
    protected int $orderId2;
    public int $orderId3 = 3;

    public function deleteUser(int $userId) {}

    public function addUser(int $userId) {}

    protected function updateUser(int $userId) {}
}

function notifyUser(string $email, int $orderId): bool {}

function getUser($id): ?string {}

trait LogsActivity {}

function sync(): void {}

function getSettings(): array {}

const DEFAULT_TAX = 0.18;

interface Cacheable
{
    public function getCacheKey(): string;
}

function generateReport(array $params): string {}

function updatePrices(array $prices): void {}

class User extends Model
{
    public function store(Request $request) {}

    public function testUserCreation(): void {}
}

function calculateEmi(float $principal, float $rate, int $years): float {}
