use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[must_use]
pub fn ticks(start: f64, stop: f64, count: f64) -> Box<[f64]> {
    if count <= 0.0 {
        return Vec::new().into_boxed_slice();
    }
    if (start - stop).abs() < f64::EPSILON {
        return vec![start].into_boxed_slice();
    }

    let (i1, i2, inc) = match start.partial_cmp(&stop) {
        Some(Ordering::Greater) => tick_spec(stop, start, count),
        _ => tick_spec(start, stop, count),
    };

    if i2 < i1 {
        return Vec::new().into_boxed_slice();
    }

    let n = (i2 - i1 + 1) as usize;
    let reverse = start > stop;
    let mut ticks = Vec::with_capacity(n);

    for i in 0..n {
        let value = if inc < 0.0 { (i1 + i as i32) as f64 / -inc } else { (i1 + i as i32) as f64 * inc };
        ticks.push(if reverse { stop + start - value } else { value });
    }

    ticks.into_boxed_slice()
}

#[wasm_bindgen]
#[must_use]
pub fn tick_increment(start: f64, stop: f64, count: f64) -> f64 {
    let (_, _, inc) = tick_spec(start, stop, count);
    inc
}

#[wasm_bindgen]
#[must_use]
pub fn tick_step(start: f64, stop: f64, count: f64) -> f64 {
    let reverse = start > stop;
    let inc = tick_increment(if reverse { stop } else { start }, if reverse { start } else { stop }, count);

    (if reverse { -1.0 } else { 1.0 }) * if inc < 0.0 { 1.0 / -inc } else { inc }
}

fn tick_spec(start: f64, stop: f64, count: f64) -> (i32, i32, f64) {
    let e10 = 50.0_f64.sqrt();
    let e5 = 10.0_f64.sqrt();
    let e2 = 2.0_f64.sqrt();

    let delta = (stop - start) / count.max(0.0);
    let power = delta.log10().floor();
    let error = delta / 10.0_f64.powf(power);
    let factor = match error {
        x if x >= e10 => 10.0,
        x if x >= e5 => 5.0,
        x if x >= e2 => 2.0,
        _ => 1.0,
    };

    let inc = 10.0_f64.powf(power) * factor;
    let mut i1 = (start / inc).round() as i32;
    let mut i2 = (stop / inc).round() as i32;

    if (i1 as f64 * inc) < start {
        i1 += 1;
    }
    if (i2 as f64 * inc) > stop {
        i2 -= 1;
    }

    if i2 < i1 && (0.5..2.0).contains(&count) {
        return tick_spec(start, stop, count * 2.0);
    }

    (i1, i2, inc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    #[test]
    #[wasm_bindgen_test]
    fn test_empty_when_count_is_zero() {
        let result = ticks(0.0, 10.0, 0.0);
        assert_eq!(result.len(), 0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_single_element_when_equal() {
        let result = ticks(5.0, 5.0, 5.0);
        assert_eq!(&*result, &[5.0]);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_simple_range() {
        let result = ticks(0.0, 10.0, 5.0);
        assert_eq!(&*result, &[0.0, 2.0, 4.0, 6.0, 8.0, 10.0]);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_decreasing_ticks() {
        let result = ticks(10.0, 0.0, 5.0);
        assert_eq!(&*result, &[10.0, 8.0, 6.0, 4.0, 2.0, 0.0]);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_negative_numbers() {
        let result = ticks(-10.0, 10.0, 5.0);
        assert_eq!(&*result, &[-10.0, -5.0, 0.0, 5.0, 10.0]);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_increment_simple() {
        let result = tick_increment(0.0, 10.0, 5.0);
        assert_eq!(result, 2.0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_increment_decreasing() {
        let result = tick_increment(10.0, 0.0, 5.0);
        assert_eq!(result, -2.0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_increment_fractional() {
        let result = tick_increment(0.0, 1.0, 5.0);
        assert_eq!(result, 0.2);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_step_simple() {
        let result = tick_step(0.0, 10.0, 5.0);
        assert_eq!(result, 2.0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_step_negative_ranges() {
        let result = tick_step(-10.0, -5.0, 5.0);
        assert_eq!(result, 1.0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_step_reversed() {
        let result = tick_step(10.0, 0.0, 5.0);
        assert_eq!(result, -2.0);
    }

    #[test]
    #[wasm_bindgen_test]
    fn test_tick_step_fractional() {
        let result = tick_step(0.0, 1.0, 5.0);
        assert_eq!(result, 0.2);
    }
}
