use rand::Rng;
use std::f64::consts::PI;
use std::fmt;

/// Represents a point on the circle's circumference.
#[derive(Debug, Clone, Copy)]
pub struct CirclePoint {
    /// Angle in radians [0, 2π)
    angle: f64,
    /// Radius of the circle
    radius: f64,
}

impl CirclePoint {
    #[must_use]
    pub fn new(angle: f64, radius: f64) -> Self {
        let normalized_angle = angle % (2.0 * PI);
        let normalized_angle = if normalized_angle < 0.0 { normalized_angle + 2.0 * PI } else { normalized_angle };

        Self { angle: normalized_angle, radius }
    }

    #[must_use]
    pub fn coordinates(&self) -> (f64, f64) {
        (self.radius * self.angle.cos(), self.radius * self.angle.sin())
    }

    /// Returns the angular distance to another point (shortest path).
    pub fn angular_distance_to(&self, other: &CirclePoint) -> f64 {
        let diff = (other.angle - self.angle).abs();
        if diff > PI {
            2.0 * PI - diff
        } else {
            diff
        }
    }

    /// Returns the direction (clockwise or counterclockwise) to reach another point
    /// along the shortest path.
    pub fn direction_to(&self, other: &CirclePoint) -> Direction {
        let mut diff = other.angle - self.angle;

        // Normalize the difference to [-π, π]
        if diff > PI {
            diff -= 2.0 * PI;
        } else if diff < -PI {
            diff += 2.0 * PI;
        }

        if diff > 0.0 {
            Direction::Counterclockwise
        } else {
            Direction::Clockwise
        }
    }
}

impl fmt::Display for CirclePoint {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Point at {:.4}π", self.angle / PI)
    }
}

/// Represents a direction of movement along the circle.
#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum Direction {
    Clockwise,
    Counterclockwise,
}

/// Represents a segment of the circle between two points.
#[derive(Debug)]
pub struct Segment {
    start: CirclePoint,
    end: CirclePoint,
    midpoint: CirclePoint,
    #[allow(dead_code)]
    radius: f64,
    index: usize,
}

impl Segment {
    /// Creates a new segment between two points.
    #[must_use]
    pub fn new(start: CirclePoint, end: CirclePoint, index: usize) -> Self {
        let radius = start.radius;

        // Calculate the midpoint
        let mut mid_angle = (start.angle + end.angle) / 2.0;

        // Handle segments that cross the 0/2π boundary
        if (end.angle - start.angle).abs() > PI {
            mid_angle += PI;
            mid_angle %= 2.0 * PI;
        }

        let midpoint = CirclePoint::new(mid_angle, radius);

        Self {
            start,
            end,
            midpoint,
            radius,
            index,
        }
    }

    /// Checks if a point is within this segment.
    pub fn contains(&self, point: &CirclePoint) -> bool {
        // Handle segments that don't cross the 0/2π boundary
        if self.start.angle <= self.end.angle {
            point.angle >= self.start.angle && point.angle <= self.end.angle
        }
        // Handle segments that cross the 0/2π boundary
        else {
            point.angle >= self.start.angle || point.angle <= self.end.angle
        }
    }

    /// Checks if a point is at the midpoint of this segment.
    pub fn is_at_midpoint(&self, point: &CirclePoint, epsilon: f64) -> bool {
        point.angular_distance_to(&self.midpoint) < epsilon
    }
}

/// The state of the free moving point.
#[derive(Debug, Clone, Copy, Eq, PartialEq)]
pub enum PointState {
    /// At rest (absorbed) at a segment midpoint
    AtRest,
    /// Actively moving (energetic)
    Energetic,
}

/// The simulation environment.
pub struct CircleEnvironment {
    /// The radius of the circle.
    radius: f64,
    /// Fixed points dividing the circle into segments.
    #[allow(dead_code)]
    fixed_points: Vec<CirclePoint>,
    /// Segments of the circle.
    segments: Vec<Segment>,
    /// The current position of the free point.
    free_point: CirclePoint,
    /// The current state of the free point.
    point_state: PointState,
    /// The current phase (active segment).
    phase_segment_index: usize,
    /// The current velocity of the free point (if moving).
    velocity: f64,
    /// Small value used for numerical comparison tolerance
    epsilon: f64,
}

impl CircleEnvironment {
    /// Creates a new circle environment with n equally spaced points.
    pub fn new(radius: f64, n: usize) -> Self {
        assert!(n >= 2, "At least 2 points are required to create segments");

        let mut fixed_points = Vec::with_capacity(n);
        let segment_angle = 2.0 * PI / n as f64;

        // Create fixed points
        for i in 0..n {
            let angle = i as f64 * segment_angle;
            fixed_points.push(CirclePoint::new(angle, radius));
        }

        // Create segments
        let mut segments = Vec::with_capacity(n);
        for i in 0..n {
            let next_i = (i + 1) % n;
            segments.push(Segment::new(fixed_points[i], fixed_points[next_i], i));
        }

        // Initialize the free point at a random position
        let mut rng = rand::rng();
        let random_angle = rng.random_range(0.0..2.0 * PI);
        let free_point = CirclePoint::new(random_angle, radius);

        // Set initial phase segment
        let phase_segment_index = rng.random_range(0..n);

        Self {
            radius,
            fixed_points,
            segments,
            free_point,
            point_state: PointState::Energetic,
            phase_segment_index,
            velocity: 0.0,
            epsilon: 1e-6,
        }
    }

    /// Returns the current segment containing the free point.
    #[must_use]
    pub fn get_current_segment(&self) -> Option<&Segment> {
        for segment in &self.segments {
            if segment.contains(&self.free_point) {
                return Some(segment);
            }
        }
        None
    }

    /// Sets a new phase segment.
    pub fn set_phase_segment(&mut self, index: usize) {
        assert!(index < self.segments.len(), "Invalid segment index");
        self.phase_segment_index = index;

        // If the free point is at rest at the midpoint of the new phase segment,
        // it stays at rest, otherwise it transitions to the energetic state.
        if let Some(current_segment) = self.get_current_segment() {
            if current_segment.index == index && current_segment.is_at_midpoint(&self.free_point, self.epsilon) {
                self.point_state = PointState::AtRest;
            } else {
                self.point_state = PointState::Energetic;
                self.calculate_velocity();
            }
        }
    }

    /// Calculates a new random velocity based on physical oscillation models.
    fn calculate_velocity(&mut self) {
        let mut rng = rand::rng();

        // Base velocity with some randomness
        let base_velocity = rng.random_range(0.01..0.05);

        // Add oscillatory component (simple harmonic motion)
        let time_factor = rng.random_range(0.0..2.0 * PI);
        let oscillation = (time_factor).sin() * 0.03;

        self.velocity = base_velocity + oscillation;

        // Make velocity positive (direction is handled separately)
        self.velocity = self.velocity.abs();
    }

    /// Updates the position of the free point for one time step.
    pub fn update(&mut self, time_step: f64) {
        // If the point is at rest, do nothing
        if self.point_state == PointState::AtRest {
            return;
        }

        let mut rng = rand::rng();

        // Get current segment
        if let Some(current_segment) = self.get_current_segment() {
            // Check if we're in the phase segment
            let in_phase_segment = current_segment.index == self.phase_segment_index;

            // If we crossed the midpoint of the phase segment, absorb
            if in_phase_segment && current_segment.is_at_midpoint(&self.free_point, self.epsilon) {
                // Set the free point exactly at the midpoint
                self.free_point = current_segment.midpoint;
                self.point_state = PointState::AtRest;
                self.velocity = 0.0;
                return;
            }

            // If we crossed the midpoint of a non-phase segment, teleport
            if !in_phase_segment && current_segment.is_at_midpoint(&self.free_point, self.epsilon) {
                // Randomly select a new segment to teleport to
                let random_segment_idx = rng.random_range(0..self.segments.len());
                let random_segment = &self.segments[random_segment_idx];

                // Teleport to the midpoint of the random segment
                self.free_point = random_segment.midpoint;

                // If we teleported to the phase segment midpoint, absorb
                if random_segment_idx == self.phase_segment_index {
                    self.point_state = PointState::AtRest;
                    self.velocity = 0.0;
                } else {
                    // Otherwise, calculate new velocity to move towards phase segment
                    self.calculate_velocity();
                }

                return;
            }
        }

        // Determine the target (midpoint of the phase segment)
        let phase_segment = &self.segments[self.phase_segment_index];
        let target = phase_segment.midpoint;

        // Determine direction (shortest path)
        let direction = self.free_point.direction_to(&target);

        // Move the free point
        let angle_change = self.velocity * time_step;

        // Apply movement with some random perturbation
        let perturbation = rng.random_range(-0.1..0.1) * angle_change;
        let effective_angle_change = angle_change + perturbation;

        let new_angle = match direction {
            Direction::Clockwise => self.free_point.angle - effective_angle_change,
            Direction::Counterclockwise => self.free_point.angle + effective_angle_change,
        };

        self.free_point = CirclePoint::new(new_angle, self.radius);

        // Occasionally update velocity to simulate physical oscillations
        if rng.random_bool(0.1) {
            self.calculate_velocity();
        }
    }

    #[must_use]
    pub fn get_state(&self) -> (CirclePoint, PointState, usize) {
        (self.free_point, self.point_state, self.phase_segment_index)
    }

    /// Returns a reference to all segments.
    pub fn get_segments(&self) -> &[Segment] {
        &self.segments
    }
}

/// A simulator that runs the circle environment.
pub struct Simulator {
    environment: CircleEnvironment,
    time_step: f64,
    current_time: f64,
}

impl Simulator {
    #[must_use]
    pub fn new(radius: f64, n_segments: usize, time_step: f64) -> Self {
        Self {
            environment: CircleEnvironment::new(radius, n_segments),
            time_step,
            current_time: 0.0,
        }
    }

    /// Runs the simulation for a specified duration.
    pub fn run(&mut self, duration: f64) {
        let end_time = self.current_time + duration;

        while self.current_time < end_time {
            let (point, state, phase) = self.get_state();
            println!("Free point: {point}, State: {state:?}, Phase segment: {phase}");
            self.environment.update(self.time_step);
            self.current_time += self.time_step;
        }
    }

    pub fn set_phase_segment(&mut self, index: usize) {
        self.environment.set_phase_segment(index);
    }

    #[must_use]
    pub fn get_state(&self) -> (CirclePoint, PointState, usize) {
        self.environment.get_state()
    }

    pub fn reset(&mut self, radius: f64, n_segments: usize) {
        self.environment = CircleEnvironment::new(radius, n_segments);
        self.current_time = 0.0;
    }
}

fn main() {
    // Create a circle with radius 1.0 and 8 segments
    let mut simulator = Simulator::new(1.0, 8, 0.01);

    // Run the simulation for 10 time units
    simulator.run(10.0);

    // Get the current state
    let (point, state, phase) = simulator.get_state();
    println!("Free point: {point}, State: {state:?}, Phase segment: {phase}");

    // Change the phase segment
    simulator.set_phase_segment(3);

    // Run for another 5 time units
    simulator.run(5.0);
}
