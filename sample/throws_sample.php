<?php


/**
 * function single_throw_example
 *
 * @param mixed $input
 *
 * @throws Exception
 *
 * @return void
 */
function single_throw_example($input)
{
    if ($input < 0) {
        throw new Exception("Input must be non-negative");
    }
    // ... function logic ...
}

/**
 * function multiple_throws_example
 *
 * @param mixed $arg
 *
 * @throws InvalidArgumentException
 * @throws DateException
 * @throws RuntimeException
 *
 * @return void
 */
function multiple_throws_example($arg)
{
    if (!is_int($arg)) {
        throw new InvalidArgumentException("Argument must be an integer");
    }

    if (!is_int($arg)) {
        throw new DateException("Argument must be an integer");
    }
    if ($arg === 0) {
        throw new RuntimeException("Argument cannot be zero");
    }
    // ... function logic ...
}
