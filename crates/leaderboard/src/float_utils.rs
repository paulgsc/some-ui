use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, PartialOrd)]
pub struct FloatWrapper {
    pub value: f64,
    pub precision: u32, // Added precision
}

impl Eq for FloatWrapper {}

impl Ord for FloatWrapper {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Handle the comparison based on the specified precision.
        let self_rounded = Self::round_to_precision(self.value, self.precision);
        let other_rounded = Self::round_to_precision(other.value, other.precision);

        if self_rounded < other_rounded {
            std::cmp::Ordering::Less
        } else if self_rounded > other_rounded {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    }
}

impl fmt::Display for FloatWrapper {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Use to_string() which already handles the printing of float.
        write!(f, "{}", self.value)
    }
}

// Define a trait that FloatWrapper implements
pub trait AsFloatWrapper {
    fn as_float_wrapper(self, precision: u32) -> FloatWrapper; // Added precision
}

// Implement the trait for FloatWrapper itself
impl AsFloatWrapper for FloatWrapper {
    fn as_float_wrapper(self, precision: u32) -> FloatWrapper {
        Self { value: self.value, precision }
    }
}

// Blanket implementation for types convertible to f64
impl<T> AsFloatWrapper for T
where
    T: Copy + Into<f64>,
{
    fn as_float_wrapper(self, precision: u32) -> FloatWrapper {
        FloatWrapper { value: self.into(), precision }
    }
}

impl FloatWrapper {
    // Helper function to round a float to a specified number of decimal places
    fn round_to_precision(value: f64, precision: u32) -> f64 {
        if precision == 0 {
            if value == 0.0 || value == -0.0 {
                return 0.0; // Ensure -0.0 becomes 0.0
            }
            return value.trunc();
        }
        let factor = 10.0_f64.powi(precision as i32);
        let rounded = (value * factor).round() / factor;
        if rounded == 0.0 || rounded == -0.0 {
            return 0.0;
        }
        rounded
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_float_wrapper_equality() {
        let a = 1.23456.as_float_wrapper(3);
        let b = 1.23457.as_float_wrapper(3);
        let c = 1.23456.as_float_wrapper(3);
        let d = (-0.0).as_float_wrapper(3);
        let e = (0.0).as_float_wrapper(3);

        assert_ne!(a, b);
        assert_eq!(a, c);
        assert_eq!(d, e); // Test -0.0 and 0.0
        assert_eq!(d.value, e.value);
    }

    #[test]
    fn test_float_wrapper_ordering() {
        let a = 1.234.as_float_wrapper(3);
        let b = 1.235.as_float_wrapper(3);
        let c = 1.234.as_float_wrapper(3);
        let d = (-0.0).as_float_wrapper(3);
        let e = (0.0).as_float_wrapper(3);

        assert!(a < b);
        assert!(b > a);
        assert_eq!(a, c);
        assert_eq!(d, e);
        assert_eq!(d.cmp(&e), std::cmp::Ordering::Equal);
    }

    #[test]
    fn test_float_wrapper_display() {
        let a = 1.23456.as_float_wrapper(3);
        assert_eq!(format!("{}", a), "1.23456"); // Check the raw value is printed.
    }

    #[test]
    fn test_as_float_wrapper_trait() {
        let a = 10.0.as_float_wrapper(2);
        let b = 5_i32.as_float_wrapper(1);
        let c = 3.14159f32.as_float_wrapper(4);

        assert_eq!(a.value, 10.0);
        assert_eq!(a.precision, 2);
        assert_eq!(b.value, 5.0);
        assert_eq!(b.precision, 1);
        assert_eq!(c.value, 3.14159);
        assert_eq!(c.precision, 4);
    }

    #[test]
    fn test_float_wrapper_precision() {
        let a = 1.23456.as_float_wrapper(0);
        assert_eq!(a.value, 1.0);

        let b = 1.23456.as_float_wrapper(1);
        assert_eq!(b.value, 1.2);

        let c = 1.23456.as_float_wrapper(2);
        assert_eq!(c.value, 1.23);

        let d = 1.23456.as_float_wrapper(3);
        assert_eq!(d.value, 1.235);

        let e = (-0.0).as_float_wrapper(3);
        let f = (0.0).as_float_wrapper(3);
        assert_eq!(e.value, 0.0);
        assert_eq!(f.value, 0.0);
    }

    #[test]
    fn test_negative_zero_equality() {
        let neg_zero = (-0.0).as_float_wrapper(5);
        let pos_zero = (0.0).as_float_wrapper(5);

        assert_eq!(neg_zero, pos_zero);
    }
}
