<?php

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
    function d() {}
}

/**
 * function add
 *
 * @param float $a
 * @param float $b
 *
 * @return bool|array|string|Company
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

    return new Company();
}

/**
 * function multiple_return_example
 * this is an example function that demonstrates multiple return types
 *
 * @param array $data
 * @param mixed $userId
 * @param bool $isTest
 *
 * @return string|int|array
 */
function multiple_return_example(array $data, int|string $userId, bool $isTest): string|int|array
{
    if ($a) {
        return [];
    } else if (1) {
        return "asd";
    }
    return 34.5;
}

/**
 * function lead_add_form
 *
 * @return void
 */
function lead_add_form()
{
    // getSettings("IS_OUTLET_ENABLE");
}

/**
 * class OrderProcessor
 */
class OrderProcessor
{
    private int $orderId;
    public int $orderId1;
    protected int $orderId2;
    public int $orderId3 = 3;

    public function deleteUser(int $userId) {}

    public function addUser(int $userId): string|float
    {
        return 1.4;
    }

    protected function updateUser(int $userId) {}
}

function notifyUser(string $email, int $orderId): bool
{
    return true;
}

function getUser($id): ?string
{
    return null;
}

trait LogsActivity {}

function sync(): void {}

/**
 * function getSettings
 *
 * @return array
 */
function getSettings(): array
{
    return [
        'IS_OUTLET_ENABLE' => true,
        'IS_FEATURE_ENABLED' => false,
    ];
}

const DEFAULT_TAX = 0.18;

interface Cacheable
{
    public function getCacheKey(): string;
}

function generateReport(array $params): string
{
    return "Report generated with params: " . implode(", ", $params);
}

function updatePrices(array $prices): void {}

class User extends Model
{
    public function store(Request $request) {}

    public function testUserCreation(): void {}
}

/**
 * function calculateEmi
 *
 * @param float $principal
 * @param float $rate
 * @param int $years
 *
 * @return float
 */
function calculateEmi(float $principal, float $rate, int $years): float
{
    $monthlyRate = $rate / 12 / 100;
    $months = $years * 12;
    return ($principal * $monthlyRate) / (1 - pow(1 + $monthlyRate, -$months));
}
