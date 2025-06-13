<?php

/**
 * function outer
 *
 * @return array
 */
function outer()
{
    /**
     * function inner
     *
     * @return array
     */
    function inner()
    {
        /**
         * function deepNested
         *
         * Handles deep nesting with input types
         *
         * @author Hitesh
         *
         * @param int $first
         * @param string $second
         *
         * @return array
         */
        function deepNested(int $first, string $second)
        {
            /**
             * function mostInner
             *
             * @return void
             */
            function mostInner() {}

            return [];
        }
    }

    /**
     * function anotherInner
     *
     * @return void
     */
    function anotherInner() {}

    /**
     * function oneMoreInner
     *
     * Final inner block
     *
     * @since 0.9
     *
     * @return void
     */
    function oneMoreInner() {}
}

/**
 * function add
 *
 * Add function to process values
 *
 * @author Hitesh Vaghela
 *
 * @param float $a
 * @param string $b
 *
 * @return int
 */
function add(float $a, string $b)
{
    getSettings("test1");
    getSettings("test");

    return intval($a + $b);
}

/**
 * class OrderProcessor
 */
class OrderProcessor
{
    /**
     * @var int
     */
    private int $orderId;

    /**
     * @var int
     */
    public int $orderId1;

    /**
     * @var int
     */
    protected int $orderId2;

    /**
     * @var int
     */
    public int $orderId3 = 3;

    /**
     * function deleteUser
     *
     * @param int $userId
     *
     * @return void
     */
    public function deleteUser(int $userId) {}

    /**
     * function addUser
     *
     * Add new user to the system
     *
     * @author Hitesh Vaghela
     *
     * @param int $userId
     *
     * @return void
     */
    public function addUser(int $userId) {}

    /**
     * function updateUser
     *
     * @param int $userId
     *
     * @return void
     */
    protected function updateUser(int $userId) {}
}

/**
 * function notifyUser
 *
 * Notifies user for given order
 *
 * @since 1.0.2
 *
 * @param string $email
 * @param int $orderId
 *
 * @return bool
 */
function notifyUser(string $email, int $orderId): bool {}

/**
 * function getUser
 *
 * Retrieves user data
 *
 * @param mixed $id
 *
 * @return string
 */
function getUser($id): ?string {}

/**
 * trait LogsActivity
 */
trait LogsActivity {}

/**
 * function sync
 *
 * @return void
 */
function sync(): void {}

/**
 * function getSettings
 *
 * @return array
 */
function getSettings(): array {}

const DEFAULT_TAX = 0.18;

/**
 * interface Cacheable
 */
interface Cacheable
{
    /**
     * function getCacheKey
     *
     * Returns the cache key
     *
     * @version 2.0
     *
     * @return string
     */
    public function getCacheKey(): string;
}

/**
 * function generateReport
 *
 * Generate the monthly report
 *
 * @author Hitesh
 *
 * @param array $params
 *
 * @return string
 */
function generateReport(array $params): string {}

/**
 * function updatePrices
 *
 * @param array $prices
 *
 * @return void
 */
function updatePrices(array $prices): void {}

/**
 * class User
 */
class User extends Model
{
    /**
     * function store
     *
     * @param Request $request
     *
     * @return void
     */
    public function store(Request $request): void {}

    /**
     * function testUserCreation
     *
     * Test user creation logic
     *
     * @since 0.8.5
     *
     * @return void
     */
    public function testUserCreation(): void {}
}

/**
 * function calculateEmi
 *
 * Calculate EMI from given financial data
 *
 * @version 1.3.0
 *
 * @param float $principal
 * @param float $rate
 * @param int $years
 *
 * @return float
 */
function calculateEmi(float $principal, float $rate, int $years): float {}
