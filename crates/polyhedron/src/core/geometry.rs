pub type FaceIndex = usize;

/// Describes a rotation cycle through polyhedron faces
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RotationCycle {
    /// Ordered sequence of face indices in this rotation
    pub faces: Vec<FaceIndex>,
    /// Human-readable name
    pub name: String,
}

impl RotationCycle {
    pub fn new(name: impl Into<String>, faces: Vec<FaceIndex>) -> Self {
        Self { name: name.into(), faces }
    }

    pub fn len(&self) -> usize {
        self.faces.len()
    }

    /// Get face at cycle position
    pub fn face_at(&self, position: usize) -> FaceIndex {
        self.faces[position % self.faces.len()]
    }

    /// Find position of face in cycle (if present)
    pub fn position_of(&self, face: FaceIndex) -> Option<usize> {
        self.faces.iter().position(|&f| f == face)
    }
}

/// Defines the topology of a polyhedron
#[derive(Clone, Debug)]
pub struct Polyhedron {
    /// Total number of faces
    pub face_count: usize,
    /// Available rotation cycles
    pub cycles: Vec<RotationCycle>,
}

impl Polyhedron {
    /// Standard cube with 6 faces
    pub fn cube() -> Self {
        Self {
            face_count: 6,
            cycles: vec![
                RotationCycle::new("Y-axis", vec![0, 3, 2, 1]), // Front->Right->Back->Left
                RotationCycle::new("X-axis", vec![0, 5, 2, 4]), // Front->Top->Back->Bottom
            ],
        }
    }

    /// Hexagonal prism (6 sides + 2 caps)
    pub fn hex_prism() -> Self {
        Self {
            face_count: 8,
            cycles: vec![
                RotationCycle::new("Circumference", vec![0, 1, 2, 3, 4, 5]),
                RotationCycle::new("Vertical", vec![0, 6, 3, 7]), // Through caps
            ],
        }
    }

    /// Simple carousel (all faces in one cycle)
    pub fn carousel(face_count: usize) -> Self {
        Self {
            face_count,
            cycles: vec![RotationCycle::new("Circular", (0..face_count).collect())],
        }
    }

    /// Get cycle by index
    pub fn cycle(&self, index: usize) -> &RotationCycle {
        &self.cycles[index % self.cycles.len()]
    }
}

impl Default for Polyhedron {
    fn default() -> Self {
        Self::cube()
    }
}
