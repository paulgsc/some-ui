pub type FaceIndex = usize;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum RotationCycleKind {
    CubeYAxis,
    CubeXAxis,
    HexCircumference,
    HexVertical,
    CarouselCircular,
}

impl RotationCycleKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CubeYAxis => "cube:y",
            Self::CubeXAxis => "cube:x",
            Self::HexCircumference => "hex:circumference",
            Self::HexVertical => "hex:vertical",
            Self::CarouselCircular => "carousel:circular",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        Some(match s {
            "cube:y" => Self::CubeYAxis,
            "cube:x" => Self::CubeXAxis,
            "hex:circumference" => Self::HexCircumference,
            "hex:vertical" => Self::HexVertical,
            "carousel:circular" => Self::CarouselCircular,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct RotationCycle {
    pub kind: RotationCycleKind,
    pub faces: Vec<FaceIndex>,
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
    pub fn cycle_index_by_kind(&self, kind: RotationCycleKind) -> Option<usize> {
        self.cycles.iter().position(|c| c.kind == kind)
    }

    pub fn cube() -> Self {
        Self {
            face_count: 6,
            cycles: vec![
                RotationCycle {
                    kind: RotationCycleKind::CubeYAxis,
                    faces: vec![0, 3, 2, 1],
                },
                RotationCycle {
                    kind: RotationCycleKind::CubeXAxis,
                    faces: vec![0, 5, 2, 4],
                },
            ],
        }
    }

    pub fn hex_prism() -> Self {
        Self {
            face_count: 8,
            cycles: vec![
                RotationCycle {
                    kind: RotationCycleKind::HexCircumference,
                    faces: vec![0, 1, 2, 3, 4, 5],
                },
                RotationCycle {
                    kind: RotationCycleKind::HexVertical,
                    faces: vec![0, 6, 3, 7],
                },
            ],
        }
    }

    pub fn carousel(face_count: usize) -> Self {
        Self {
            face_count,
            cycles: vec![RotationCycle {
                kind: RotationCycleKind::CarouselCircular,
                faces: (0..face_count).collect(),
            }],
        }
    }
}

impl Default for Polyhedron {
    fn default() -> Self {
        Self::cube()
    }
}
