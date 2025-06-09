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
 * @return mixed
 */
function add(float $a, float $b)
{
    return intval($a + $b);
}

class OrderProcessor
{
    private string $orderId;
    public array $orderId1;
    protected float $orderId2;
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
