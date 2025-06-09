<?php

function multiple_return_example(array $data, int|string $userId, bool $isTest): array|float|string
{
    if ($data) {
        return [];
    } else if (1) {
        return 1;
    }
    return 3.54;
    // return "asd";
}

/**
 * function a
 *
 * @author John Doe
 * @version 1.0
 * @since 2023-10-01 
 *
 * @return array|float|int|string
 */
function a()
{
    $value_1 = 10;

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
     * function d
     *
     * @return mixed
     */
    function d() {}

    // return $value_1;
    return 123;
    return 123.4;
    return [];
    return "abc";
}

/**
 * function add
 *
 * @author John Doe
 * @version   1.0
 * @since 2023-10-01
 *
 * @param float $a
 * @param float $b
 *
 * @throws DateMalformedStringException
 * @throws Exception
 * @throws ArithmeticError
 *
 * @return User|array|bool|string
 *
 * @settings
 * - IS_OUTLET_ENABLE
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

    return new User();
    throw new Exception("An error occurred");
    throw new ArithmeticError("Arithmetic error occurred");
    throw new DateMalformedStringException("Malformed date string");
    getSettings("IS_OUTLET_ENABLE");

    try {
        // some code
    } catch (Exception $e) {
        // handle exception
    }

    return new Exception();
}

/**
 * function lead_add_form
 *
 * @return void
 *
 * @settings
 * - IS_OUTLET_ENABLE
 */
function lead_add_form()
{
    getSettings("IS_OUTLET_ENABLE");
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

    public function deleteUser(int $userId): string
    {
        return "User with ID $userId deleted.";
    }

    public function addUser(int $userId): void {}

    protected function updateUser(int $userId) {}
}

function notifyUser(string $email, int $orderId): int|bool|string
{
    return 1; // or return true;
    return true; // or return false;
}

function getUser($id): ?string
{
    return null; // or return "John Doe";
    return "Jane Doe";
}

trait LogsActivity {}

function sync(): void {}

function getSettings(): array
{
    return [
        'IS_OUTLET_ENABLE' => true,
        'ANOTHER_SETTING' => 'value',
    ];
}

const DEFAULT_TAX = 0.18;

interface Cacheable
{
    public function getCacheKey(): string;
}

function generateReport(array $params): string
{
    // Generate report logic
    return "Report generated successfully";
}

function updatePrices(array $prices): void {}

class User extends Model
{
    public function store(Request $request) {}

    public function testUserCreation(): void {}
}

function calculateEmi(float $principal, float $rate, int $years): float
{
    $monthlyRate = $rate / 12 / 100;
    $months = $years * 12;
    return ($principal * $monthlyRate) / (1 - pow(1 + $monthlyRate, -$months));
}
