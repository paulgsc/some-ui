use js_sys::{Array, Date as JsDate};
use serde_wasm_bindgen::{from_value, to_value};
/// This is a fork of <https://github.com/d3/d3-array/blob/d6c195ab0f21b5fe30cd2a32612410998d281ecc/src/ticks.js>.
///
/// We(Me, Myself and I) intentionally forked this because:
/// - Just a noob doing nooby stuff!? 😅
///
/// # License
/// This project is licensed under the terms specified in  
/// <https://github.com/d3/d3-array/blob/d6c195ab0f21b5fe30cd2a32612410998d281ecc/LICENSE>.
use wasm_bindgen::prelude::*;

// Keep your existing implementation
pub trait Interpolate: Copy {
	fn interpolate(self, other: Self, t: f64) -> Self;
}

impl Interpolate for f64 {
	fn interpolate(self, other: Self, t: f64) -> Self {
		self * (1.0 - t) + other * t
	}
}

#[derive(Clone)]
pub struct LinearScale<T: Interpolate> {
	domain: Vec<f64>,
	range: Vec<T>,
	clamped: bool,
}

impl<T: Interpolate + Default> LinearScale<T> {
	// ... keep all existing methods ...
	#[must_use]
	pub fn new() -> Self {
		Self {
			domain: vec![0.0, 1.0],
			range: vec![T::default(), T::interpolate(T::default(), T::default(), 1.0)],
			clamped: false,
		}
	}

	#[must_use]
	pub fn domain(mut self, domain: Vec<f64>) -> Self {
		self.domain = domain;
		self
	}

	#[must_use]
	pub fn range(mut self, range: Vec<T>) -> Self {
		self.range = range;
		self
	}

	#[must_use]
	pub const fn clamp(mut self, clamp: bool) -> Self {
		self.clamped = clamp;
		self
	}

	#[must_use]
	pub fn scale(&self, value: f64) -> T {
		if self.domain.len() < 2 || self.range.len() < 2 {
			return self.range[0];
		}

		// Find the appropriate domain segment
		let mut i = 0;
		while i < self.domain.len() - 1 && value > self.domain[i + 1] {
			i += 1;
		}

		if i == self.domain.len() - 1 {
			if self.clamped {
				return self.range[i];
			}
			i = self.domain.len() - 2;
		}

		// Calculate normalized position within domain segment
		let domain_width = self.domain[i + 1] - self.domain[i];
		let t = if domain_width == 0.0 {
			0.5
		} else {
			let t = (value - self.domain[i]) / domain_width;
			if self.clamped {
				t.max(0.0).min(1.0)
			} else {
				t
			}
		};

		// Interpolate within range segment
		T::interpolate(self.range[i], self.range[i + 1], t)
	}

	#[must_use]
	pub fn get_domain(&self) -> &[f64] {
		&self.domain
	}

	#[must_use]
	pub fn ticks(&self, count: Option<usize>) -> Vec<f64> {
		let count = count.unwrap_or(10);
		if self.domain.len() < 2 {
			return vec![];
		}

		let start = self.domain[0];
		let end = self.domain[self.domain.len() - 1];

		generate_ticks(start, end, count)
	}

	#[must_use]
	pub fn tick_format(&self, count: Option<usize>, specifier: Option<&str>) -> Box<dyn Fn(f64) -> String> {
		let count = count.unwrap_or(10);
		if self.domain.len() < 2 {
			return Box::new(|_| String::new());
		}

		let start = self.domain[0];
		let end = self.domain[self.domain.len() - 1];

		match specifier {
			Some(spec) => create_format_with_specifier(spec),
			None => {
				let step = tick_increment(start, end, count);
				create_format_for_step(step)
			}
		}
	}

	pub fn nice(&mut self, count: Option<usize>) -> &mut Self {
		let count = count.unwrap_or(10);
		if self.domain.len() < 2 {
			return self;
		}

		let mut start = self.domain[0];
		let mut stop = self.domain[self.domain.len() - 1];

		if stop < start {
			std::mem::swap(&mut start, &mut stop);
		}

		let mut prestep = None;
		let mut max_iter = 10;

		while max_iter > 0 {
			let tick_step: f64 = tick_increment(start, stop, count);

			if let Some(prev_step) = prestep {
				if (tick_step - prev_step as f64).abs() < f64::EPSILON {
					self.domain[0] = start;
					let l = self.domain.len();
					self.domain[l - 1] = stop;
					return self;
				}
			}

			if tick_step > 0.0 {
				start = (start / tick_step).floor() * tick_step;
				stop = (stop / tick_step).ceil() * tick_step;
			} else if tick_step < 0.0 {
				start = (start * tick_step).ceil() / tick_step;
				stop = (stop * tick_step).floor() / tick_step;
			} else {
				break;
			}

			prestep = Some(tick_step);
			max_iter -= 1;
		}

		self
	}

	pub fn copy(&self) -> Self {
		Self {
			domain: self.domain.clone(),
			range: self.range.clone(),
			clamped: self.clamped,
		}
	}
}

// Keep the helper functions
#[must_use]
pub fn generate_ticks(start: f64, stop: f64, count: usize) -> Vec<f64> {
	if start == stop {
		return vec![start];
	}

	let tick_step = tick_increment(start, stop, count);
	if tick_step == 0.0 {
		return vec![start];
	}

	let mut ticks = Vec::new();
	let mut i = (start / tick_step).ceil();
	let stop_i = (stop / tick_step).floor();

	if tick_step < 0.0 {
		i = (start * tick_step).ceil();
		let stop_i = (stop * tick_step).floor();

		while i >= stop_i {
			ticks.push(i / tick_step);
			i -= 1.0;
		}
	} else {
		while i <= stop_i {
			ticks.push(i * tick_step);
			i += 1.0;
		}
	}

	ticks
}

#[must_use]
pub fn tick_increment(start: f64, stop: f64, count: usize) -> f64 {
	let tick_step = (stop - start) / count as f64;
	let power = (tick_step.abs().log10()).floor();
	let error = tick_step / 10.0_f64.powf(power);

	let factor = if error >= 7.5 {
		10.0
	} else if error >= 3.0 {
		5.0
	} else if error >= 2.0 {
		4.0
	} else if error >= 1.5 {
		3.0
	} else if error >= 1.0 {
		2.0
	} else {
		1.0
	};

	let tick_step = factor * 10.0_f64.powf(power);
	if stop < start {
		-tick_step
	} else {
		tick_step
	}
}

fn create_format_for_step(tick_step: f64) -> Box<dyn Fn(f64) -> String> {
	let precision = if tick_step == 0.0 {
		0
	} else {
		let e = tick_step.abs().log10().floor() as i32;
		if e >= 0 {
			0
		} else {
			-e as usize
		}
	};

	Box::new(move |x| format!("{:.*}", precision, x))
}

fn create_format_with_specifier(specifier: &str) -> Box<dyn Fn(f64) -> String> {
	if specifier.contains('e') {
		Box::new(move |x| format!("{:e}", x))
	} else if specifier.contains('f') {
		let precision = specifier
			.chars()
			.skip_while(|c| *c != '.')
			.skip(1)
			.take_while(|c| c.is_ascii_digit())
			.collect::<String>()
			.parse::<usize>()
			.unwrap_or(6);

		Box::new(move |x| format!("{:.*}", precision, x))
	} else {
		Box::new(move |x| format!("{}", x))
	}
}

// Define a TimeScale struct for handling dates
#[derive(Clone)]
pub struct TimeScale {
	domain: Vec<f64>, // Store dates as timestamps
	range: Vec<f64>,
	clamped: bool,
}

impl Default for TimeScale {
	fn default() -> Self {
		Self::new()
	}
}

impl TimeScale {
	#[must_use]
	pub fn new() -> Self {
		let now = js_sys::Date::now();
		Self {
			domain: vec![now, now + 86400000.0], // Default domain: now to now + 1 day
			range: vec![0.0, 1.0],
			clamped: false,
		}
	}

	#[must_use]
	pub fn domain(mut self, domain: Vec<f64>) -> Self {
		self.domain = domain;
		self
	}

	#[must_use]
	pub fn range(mut self, range: Vec<f64>) -> Self {
		self.range = range;
		self
	}

	#[must_use]
	pub const fn clamp(mut self, clamp: bool) -> Self {
		self.clamped = clamp;
		self
	}

	#[must_use]
	pub fn scale(&self, value: f64) -> f64 {
		if self.domain.len() < 2 || self.range.len() < 2 {
			return self.range[0];
		}

		// Find the appropriate domain segment
		let mut i = 0;
		while i < self.domain.len() - 1 && value > self.domain[i + 1] {
			i += 1;
		}

		if i == self.domain.len() - 1 {
			if self.clamped {
				return self.range[i];
			}
			i = self.domain.len() - 2;
		}

		// Calculate normalized position within domain segment
		let domain_width = self.domain[i + 1] - self.domain[i];
		let t = if domain_width == 0.0 {
			0.5
		} else {
			let t = (value - self.domain[i]) / domain_width;
			if self.clamped {
				t.max(0.0).min(1.0)
			} else {
				t
			}
		};

		// Interpolate within range segment
		f64::interpolate(self.range[i], self.range[i + 1], t)
	}

	#[must_use]
	pub fn ticks(&self, count: Option<usize>) -> Vec<f64> {
		let count = count.unwrap_or(10);
		if self.domain.len() < 2 {
			return vec![];
		}

		let start = self.domain[0];
		let end = self.domain[self.domain.len() - 1];

		// For time scales, we could implement specialized date ticking logic,
		// but for now we'll just use linear ticks on the timestamps
		generate_ticks(start, end, count)
	}

	#[must_use]
	pub fn nice(&mut self, count: Option<usize>) -> &mut Self {
		let _ = count.unwrap_or(10);
		if self.domain.len() < 2 {
			return self;
		}

		// Basic implementation - round to nearest day boundaries
		let day_ms = 86400000.0;

		let mut start = self.domain[0];
		let mut stop = self.domain[self.domain.len() - 1];

		// Round down to day
		start = (start / day_ms).floor() * day_ms;
		// Round up to day
		stop = (stop / day_ms).ceil() * day_ms;

		self.domain[0] = start;
		let l = self.domain.len();
		self.domain[l - 1] = stop;

		self
	}

	pub fn copy(&self) -> Self {
		Self {
			domain: self.domain.clone(),
			range: self.range.clone(),
			clamped: self.clamped,
		}
	}
}

// Implement WebAssembly bindings
#[wasm_bindgen]
pub struct ScaleLinear {
	scale: LinearScale<f64>,
}

#[wasm_bindgen]
impl ScaleLinear {
	#[wasm_bindgen(constructor)]
	pub fn new() -> Self {
		Self { scale: LinearScale::new() }
	}

	#[wasm_bindgen]
	pub fn domain(&mut self, domain_array: &JsValue) -> Result<ScaleLinear, JsValue> {
		let domain: Vec<f64> = from_value(domain_array.clone())?;
		self.scale = self.scale.clone().domain(domain);
		Ok(Self { scale: self.scale.clone() })
	}

	#[wasm_bindgen]
	pub fn range(&mut self, range_array: &JsValue) -> Result<ScaleLinear, JsValue> {
		let range: Vec<f64> = from_value(range_array.clone())?;
		self.scale = self.scale.clone().range(range);
		Ok(Self { scale: self.scale.clone() })
	}

	#[wasm_bindgen]
	pub fn clamp(&mut self, clamp: bool) -> ScaleLinear {
		self.scale = self.scale.clone().clamp(clamp);
		Self { scale: self.scale.clone() }
	}

	#[wasm_bindgen]
	pub fn scale(&self, value: f64) -> f64 {
		self.scale.scale(value)
	}

	#[wasm_bindgen]
	pub fn nice(&mut self, count: Option<usize>) -> ScaleLinear {
		let mut scale_copy = self.scale.clone();
		scale_copy.nice(count);
		Self { scale: scale_copy }
	}

	#[wasm_bindgen]
	pub fn ticks(&self, count: Option<usize>) -> Result<JsValue, JsValue> {
		let ticks = self.scale.ticks(count);
		to_value(&ticks).map_err(|e| e.into())
	}
}

#[wasm_bindgen]
pub struct ScaleTime {
	scale: TimeScale,
}

#[wasm_bindgen]
impl ScaleTime {
	#[wasm_bindgen(constructor)]
	pub fn new() -> Self {
		Self { scale: TimeScale::new() }
	}

	#[wasm_bindgen]
	pub fn domain(&mut self, date_array: &JsValue) -> Result<ScaleTime, JsValue> {
		// Convert array of JS Dates to array of timestamps
		let date_array_js: Array = Array::from(date_array);
		let mut domain = Vec::with_capacity(date_array_js.length() as usize);

		for i in 0..date_array_js.length() {
			let date_js = JsDate::from(date_array_js.get(i));
			domain.push(date_js.get_time());
		}

		self.scale = self.scale.clone().domain(domain);
		Ok(Self { scale: self.scale.clone() })
	}

	#[wasm_bindgen]
	pub fn range(&mut self, range_array: &JsValue) -> Result<ScaleTime, JsValue> {
		let range: Vec<f64> = from_value(range_array.clone())?;
		self.scale = self.scale.clone().range(range);
		Ok(Self { scale: self.scale.clone() })
	}

	#[wasm_bindgen]
	pub fn clamp(&mut self, clamp: bool) -> ScaleTime {
		self.scale = self.scale.clone().clamp(clamp);
		Self { scale: self.scale.clone() }
	}

	#[wasm_bindgen]
	pub fn scale(&self, date: &JsDate) -> f64 {
		self.scale.scale(date.get_time())
	}

	#[wasm_bindgen]
	pub fn nice(&mut self, count: Option<usize>) -> ScaleTime {
		let mut scale_copy = self.scale.clone();
		let _ = scale_copy.nice(count);
		Self { scale: scale_copy }
	}

	#[wasm_bindgen]
	pub fn ticks(&self, count: Option<usize>) -> Result<JsValue, JsValue> {
		let timestamp_ticks = self.scale.ticks(count);

		// Convert timestamps back to JS Dates
		let js_array = Array::new_with_length(timestamp_ticks.len() as u32);
		for (i, timestamp) in timestamp_ticks.iter().enumerate() {
			let date = JsDate::new(&JsValue::from_f64(*timestamp));
			js_array.set(i as u32, date.into());
		}

		Ok(js_array.into())
	}
}

// Helper function for array extent calculation - mimics d3.extent
#[wasm_bindgen]
pub fn extent(array: &JsValue) -> Result<JsValue, JsValue> {
	let values: Vec<f64> = from_value(array.clone())?;

	if values.is_empty() {
		return Ok(Array::new_with_length(0).into());
	}

	let mut min = values[0];
	let mut max = values[0];

	for &val in &values {
		if val < min {
			min = val;
		}
		if val > max {
			max = val;
		}
	}

	let result = Array::new_with_length(2);
	result.set(0, JsValue::from(min));
	result.set(1, JsValue::from(max));

	Ok(result.into())
}

#[wasm_bindgen]
pub fn extent_by_accessor(array: &JsValue, accessor: &js_sys::Function) -> Result<JsValue, JsValue> {
	let array_js = Array::from(array);
	let length = array_js.length();

	if length == 0 {
		return Ok(Array::new_with_length(0).into());
	}

	let this = JsValue::null();
	let first_item = array_js.get(0);
	let first_value = accessor.call1(&this, &first_item)?;

	let mut min: f64;
	let mut max: f64;

	if first_value.is_instance_of::<JsDate>() {
		let date = JsDate::from(first_value);
		min = date.get_time();
		max = min;

		for i in 1..length {
			let item = array_js.get(i);
			let value = accessor.call1(&this, &item)?;
			let date = JsDate::from(value);
			let time = date.get_time();

			if time < min {
				min = time;
			}
			if time > max {
				max = time;
			}
		}

		let result = Array::new_with_length(2);
		result.set(0, JsDate::new(&JsValue::from(min)).into());
		result.set(1, JsDate::new(&JsValue::from(max)).into());

		Ok(result.into())
	} else {
		// Assume numeric values
		min = first_value.as_f64().unwrap_or(0.0);
		max = min;

		for i in 1..length {
			let item = array_js.get(i);
			let value = accessor.call1(&this, &item)?;
			let num = value.as_f64().unwrap_or(0.0);

			if num < min {
				min = num;
			}
			if num > max {
				max = num;
			}
		}

		let result = Array::new_with_length(2);
		result.set(0, JsValue::from(min));
		result.set(1, JsValue::from(max));

		Ok(result.into())
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_basic_scale() {
		let scale = LinearScale::new().domain(vec![0.0, 100.0]).range(vec![0.0, 1000.0]);

		assert_eq!(scale.scale(0.0), 0.0);
		assert_eq!(scale.scale(50.0), 500.0);
		assert_eq!(scale.scale(100.0), 1000.0);

		// Test interpolation beyond domain
		assert_eq!(scale.scale(150.0), 1500.0);
		assert_eq!(scale.scale(-50.0), -500.0);
	}

	#[test]
	fn test_clamp() {
		let scale = LinearScale::new().domain(vec![0.0, 100.0]).range(vec![0.0, 1000.0]).clamp(true);

		assert_eq!(scale.scale(0.0), 0.0);
		assert_eq!(scale.scale(50.0), 500.0);
		assert_eq!(scale.scale(100.0), 1000.0);

		// Test clamping
		assert_eq!(scale.scale(150.0), 1000.0);
		assert_eq!(scale.scale(-50.0), 0.0);
	}

	#[test]
	fn test_ticks() {
		let scale = LinearScale::<f64>::new().domain(vec![0.0, 10.0]);

		let ticks = scale.ticks(Some(5));
		// Should generate approximately 5 ticks
		assert!(ticks.len() >= 4 && ticks.len() <= 6);

		// First tick should be >= 0.0
		assert!(ticks[0] >= 0.0);
		// Last tick should be <= 10.0
		assert!(ticks[ticks.len() - 1] <= 10.0);
	}

	#[test]
	fn test_nice() {
		let mut scale = LinearScale::<f64>::new().domain(vec![0.23, 9.89]);

		scale.nice(Some(5));
		let domain = scale.get_domain();

		// Domain should be nicely rounded now
		assert!(domain[0] <= 0.23);
		assert!(domain[1] >= 9.89);

		// Check if values are nice (should be round numbers)
		assert_eq!(domain[0].fract(), 0.0);
		assert_eq!(domain[1].fract(), 0.0);
	}

	#[test]
	fn test_tick_format() {
		let scale = LinearScale::<f64>::new().domain(vec![0.0, 100.0]);

		let formatter = scale.tick_format(Some(5), None);

		// Test format for different values
		assert_eq!(formatter(0.0), "0");
		assert_eq!(formatter(20.0), "20");
		assert_eq!(formatter(100.0), "100");

		// Test with decimal values
		let scale = LinearScale::<f64>::new().domain(vec![0.0, 0.1]);
		let formatter = scale.tick_format(Some(5), None);

		// Should format with appropriate precision
		assert!(formatter(0.02).contains("."));
	}

	#[test]
	fn test_copy() {
		let scale = LinearScale::new().domain(vec![0.0, 100.0]).range(vec![0.0, 1000.0]);

		let copy = scale.copy();

		// The copy should behave identically
		assert_eq!(scale.scale(50.0), copy.scale(50.0));

		// But it should be independent
		let _ = copy.clone().domain(vec![0.0, 200.0]);

		assert_eq!(scale.scale(100.0), 1000.0);
		assert_eq!(copy.scale(100.0), 500.0);
	}
}
