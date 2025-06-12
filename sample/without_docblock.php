<?php

/**
 * Outer wrapper function
 *
 * @since 1.0.0
 */
function outer()
{
    /**
     * Inner level function
     *
     * @version 1.1
     */
    function inner()
    {
        /**
         * Handles deep nesting with input types
         *
         * @author Hitesh
         */
        function deepNested(int $first, string $second)
        {
            function mostInner() {}

            return [];
        }
    }

    function anotherInner() {}

    /**
     * Final inner block
     *
     * @since 0.9
     */
    function oneMoreInner() {}
}

/**
 * Add function to process values
 *
 * @author Hitesh Vaghela
 */
function add(float $a, string $b)
{
    getSettings("test1");
    getSettings("test");

    return intval($a + $b);
}

class OrderProcessor
{
    private int $orderId;
    public int $orderId1;
    protected int $orderId2;
    public int $orderId3 = 3;

    public function deleteUser(int $userId) {}

    /**
     * Add new user to the system
     *
     * @author Hitesh Vaghela
     */
    public function addUser(int $userId) {}

    protected function updateUser(int $userId) {}
}

/**
 * Notifies user for given order
 *
 * @since 1.0.2
 */
function notifyUser(string $email, int $orderId): bool {}

/**
 * Retrieves user data
 */
function getUser($id): ?string {}

trait LogsActivity {}

function sync(): void {}

function getSettings(): array {}

const DEFAULT_TAX = 0.18;

interface Cacheable
{
    /**
     * Returns the cache key
     *
     * @version 2.0
     */
    public function getCacheKey(): string;
}

/**
 * Generate the monthly report
 *
 * @author Hitesh
 */
function generateReport(array $params): string {}

function updatePrices(array $prices): void {}

class User extends Model
{
    public function store(Request $request): void {}

    /**
     * Test user creation logic
     *
     * @since 0.8.5
     */
    public function testUserCreation(): void {}
}

/**
 * Calculate EMI from given financial data
 *
 * @version 1.3.0
 */
function calculateEmi(float $principal, float $rate, int $years): float {}
