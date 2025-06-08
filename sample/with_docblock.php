
<?php

/**
 * Adds two numbers and returns the result.
 *
 * @param int $a The first number.
 * @param int $b The second number.
 * @return int The sum of the two numbers.
 */
function add(int $a, int $b): int {
    return $a + $b;
}

/**
 * Class OrderProcessor
 *
 * Handles order processing logic.
 *
 * @author Hitesh
 * @version 1.0
 * @license MIT
 */
class OrderProcessor {
}

/**
 * The unique ID of the order.
 *
 * @var int
 */
private int $orderId;

/**
 * Sends a notification email to the user after successful order placement.
 *
 * @param string $email User's email address.
 * @param int $orderId ID of the placed order.
 * @return bool True on success, false on failure.
 */
function notifyUser(string $email, int $orderId): bool {
}

/**
 * Get a user's name by ID or return null.
 *
 * @param int|string $id User ID or username.
 * @return string|null The user's name or null if not found.
 */
function getUser($id): ?string {
}

/**
 * Trait LogsActivity
 *
 * Adds logging capabilities to any class.
 */
trait LogsActivity {
}

/**
 * Performs a background sync operation.
 *
 * @return void
 */
function sync(): void {
}

/**
 * Get the settings.
 *
 * @return array<string, mixed>
 */
function getSettings(): array {
}

/**
 * The default tax rate for all items.
 *
 * @var float
 */
const DEFAULT_TAX = 0.18;

/**
 * Deletes a user from the system.
 *
 * @param int $userId
 * @throws Exception If user not found or permission denied.
 * @deprecated Use deactivateUser() instead.
 */
public function deleteUser(int $userId) {
}

/**
 * Interface Cacheable
 *
 * Classes that support caching should implement this.
 */
interface Cacheable {
    public function getCacheKey(): string;
}

/**
 * Generate a report for the given parameters.
 *
 * This function creates a CSV report that contains user statistics, activity
 * logs, and other relevant data for analysis.
 *
 * @param array $params Parameters for filtering the report.
 * @return string Path to the generated report file.
 */
function generateReport(array $params): string {
}

/**
 * Update product price in bulk.
 *
 * @param array<int, float> $prices Associative array of productId => newPrice.
 * @return void
 *
 * @todo Add support for bulk discount calculations.
 * @see updateSinglePrice()
 */
function updatePrices(array $prices): void {
}

/**
 * Store a newly created resource in storage.
 *
 * @param \Illuminate\Http\Request $request
 * @return \Illuminate\Http\JsonResponse
 *
 * @authenticated
 */
public function store(Request $request) {
}

/**
 * Test that a user can be created successfully.
 *
 * @return void
 */
public function testUserCreation(): void {
}

/**
 * App\Models\User
 *
 * @property int $id
 * @property string $name
 * @property string $email
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 */
class User extends Model {
}

/**
 * Calculate EMI for a loan.
 *
 * @param float $principal
 * @param float $rate Annual interest rate.
 * @param int $years
 * @return float Monthly EMI
 *
 * @author Hitesh
 * @created 2025-06-05
 */
function calculateEmi(float $principal, float $rate, int $years): float {
}

?>
