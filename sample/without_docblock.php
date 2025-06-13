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
 *
 * @settings
 * - test1 : 
 * - test : 
 * - IS_LEAD_CONTACT_PERSON : Is lead contact person required?
 * - IS_LEAD_INDUSTRY_TYPE : Want Industry Type in Lead
 */
function add(float $a, string $b)
{
    getSettings("test1");
    getSettings("test");
    getSettings("IS_LEAD_CONTACT_PERSON");
    getSettings("IS_LEAD_INDUSTRY_TYPE");

    //     * - IS_LEAD_INDUSTRY_TYPE : Want Industry Type in Lead
    //  * - IS_LEAD_CONTACT_PERSON : Is lead contact person required?
    //  * - IS_HIDE_LEAD_CURRENT_ADDRESS_DETAILS_ENABLED : Is hide lead current address details enabled?
    //  * - IS_CAPITAL_NAME : Wants to Show Capital Name
    //  * - IS_NAME_SAVE_IN_CAMEL_CASE_ENABLE : is Name save in camel case enable
    //  * - IS_LEAD_COMPANY_NAME : Want Company Name in Lead
    //  * - IS_LEAD_REVENUE : Want Revenue in Lead
    //  * - IS_LEAD_EMPLOYEE_STRENGTH : Want Employee Strength in Lead
    //  * - IS_LEAD_MOBILE_UNIQUE : Is mobile number uniqueness validation enabled?
    //  * - IS_LEAD_NAME_UNIQUE
    //  * - IS_CONTACT_DETAILS_OWNER_MANDATORY : Make Contact Details of Owner Mandatory
    //  * - IS_LEAD_FOLLOWUP_ALERT_MODE_MANDATORY
    //  * - IS_SITE_DETAILS_ENABLE_FOR_LEAD : Is site details enabled for lead?
    //  * - IS_LEAD_UPLOAD_FILE_ENABLE
    //  *

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
