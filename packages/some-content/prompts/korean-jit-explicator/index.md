# Korean JIT Sentence Explicator

## L′-Internal Disentanglement Specification

---

## Input Parameters

**S** (Sentence): `[Korean sentence in Hangul]`

**P** (Comprehension State): `[Brief description of current Korean competence - grammar points known, particle familiarity, verb conjugation depth]`

**T** (This Template): Specification for structured explanation

---

## Execution Constraints

### Hard Rules

1. **NO semantic translation**: Do not produce fluent English equivalents
2. **L′-primacy**: All meaning must first be expressed in simple Korean
3. **English as metalanguage only**: Use English exclusively for:
   - Naming grammatical mechanisms
   - Explaining structural relationships
   - Providing scaffolding labels
4. **Preserve structure**: Never simplify or idiomatically rewrite S
5. **Independence**: Treat vocabulary, particles, conjugations, and constructions as separable objects

### Prohibited Outputs

- ❌ Natural English translations
- ❌ "This means X in English" before Korean explanation
- ❌ Collapsing Korean constructions into English equivalents
- ❌ Skipping base forms or transformation steps

---

## Output Structure

### 1. 원문 (Original Sentence)

```
S (unchanged)
```

Present the sentence exactly as given, with no modifications.

---

### 2. 전체 구조 분해 (Structural Decomposition)

Segment S into its major constituents using spacing and bracketing:

```
[Time/Context] [Subject+Particle] [Modifiers] [Object+Particle] [Verb+Ending]
```

**Purpose**: Map the sentence topology before diving into meaning.

---

### 3. 의미를 유지한 아주 쉬운 한국어 분해 (Meaning in Simple Korean)

For each major segment identified above, provide:

#### (A) [Segment Label in Korean]

- **표면형**: `[surface form]`
- **간단한 설명** (simple Korean only):
  - `[2-3 sentence explanation using only basic Korean]`

Repeat for each segment: time expressions, subject, modifiers, object, verb phrase.

**Critical**: Explanations must be in Korean first. English may only appear in parentheses for mechanism names.

---

### 4. 어휘 기본형 분리 (Lexical Base Forms)

Present a table:

| 표면형 (Surface) | 기본형 (Base) | 품사 (Class)  | 역할 (Role in Korean) |
| ---------------- | ------------- | ------------- | --------------------- |
| word1            | base1         | noun/verb/adj | [Korean description]  |
| word2            | base2         | particle      | [Korean description]  |
| ...              | ...           | ...           | ...                   |

**Requirements**:

- Every morpheme gets its own row
- Base forms must be dictionary forms
- Role descriptions in Korean (English labels in parentheses optional)

---

### 5. 조사 분석 (Particle Analysis)

For each particle in S:

#### 조사: `[particle]`

- **붙는 곳**: `[what it attaches to]`
- **한국어 의미**: `[Korean explanation of function]`
- **이 문장에서**: `[specific role in this sentence, in Korean]`
- (English note): `[optional grammatical label]`

---

### 6. 어미 및 활용 분석 (Ending & Conjugation Analysis)

For each conjugated verb/adjective:

#### 동사/형용사: `[surface form]`

**변형 과정** (Transformation Steps):

```
기본형: [base]
  ↓
[stem]
  ↓
+ [ending 1] → [form 1]
  ↓
+ [ending 2] → [form 2]
  ↓
최종형: [final form]
```

**한국어로 각 단계 설명**:

- `[Step 1 meaning in simple Korean]`
- `[Step 2 meaning in simple Korean]`
- `[Combined meaning in simple Korean]`

(English mechanism): `[optional grammatical explanation]`

---

### 7. 핵심 문법 요소 (Critical Grammar Elements)

Identify any non-basic constructions and explain them:

#### 문법: `[construction name in Korean]`

**한국어 설명**:

- `[What A does]`
- `[How A relates to B]`
- `[Why this form is used]`

**단순화 예시** (in Korean):

- `[Simpler sentence showing same pattern]`
- `[Another example]`

(English explanation): `[only after Korean explanation]`

---

### 8. 구조 보존 재서술 (Structure-Preserving Restatement)

#### 아주 쉬운 한국어로 (In Very Simple Korean):

```
[Rewrite S using only basic vocabulary and transparent grammar,
 but preserve the exact structural relationships]
```

**Purpose**: Verify understanding remains L′-internal.

#### 구조적 영어 대조 (Structural English Gloss - Optional):

```
[Word-for-word structural mapping, NOT natural English]
```

Clearly label this as scaffolding, not the target understanding.

---

### 9. 새로운 개념 요약 (New Concepts Introduced)

List what was introduced beyond P:

#### P에 없던 것 (Not in Current P):

- **어휘**: `[new words]`
- **문법**: `[new patterns]`
- **활용**: `[new conjugations]`

#### P에 있던 것 (Already in P):

- `[confirmed known elements]`

---

### 10. 검증 질문 (Verification)

Pose 2-3 questions in Korean that test whether understanding is L′-internal:

1. `[이 문장을 더 쉬운 한국어로 다시 말할 수 있나요?]`
2. `[X를 Y로 바꾸면 의미가 어떻게 달라지나요?]`
3. `[이 구조를 사용한 새로운 문장을 만들 수 있나요?]`

**Success criterion**: Can answer these in Korean without reverting to English.

---

## Meta-Instructions for Explanation Generator

### Processing Order (Mandatory)

1. Parse S into morphemes
2. Identify base forms
3. **Explain in simple Korean first**
4. Only then provide English metalanguage
5. Build back up to S

### Language Discipline

- Default language: Korean (simple)
- Switch to English: only for metalinguistic labels
- Return to Korean: immediately after labels
- Never allow English to carry semantic payload

### Complexity Management

- If S is far beyond P, introduce concepts **ad hoc** but **explicitly**
- Mark new concepts clearly
- Do not apologize for gaps in P
- Treat each sentence as self-contained

### Output Quality Checks

- [ ] Can S be reconstructed from the explanation?
- [ ] Is all meaning grounded in Korean first?
- [ ] Is English used only for mechanism labels?
- [ ] Would a learner at P be able to follow each step?
- [ ] Are there no fluent English translations hiding in the output?

---

## Usage Example Header

When using this template, begin with:

```
S: [Korean sentence]
P: [Current competence - e.g., "comfortable with 이/가/을/를, basic verb endings -아/어요, -았/었어요, but unfamiliar with -(으)ㄴ/는 adnominal forms"]
T: [Apply Korean JIT Sentence Explicator v1.0]
```

---

## Success Definition

Understanding is successfully L′-internal when:

1. You can restate S in simpler Korean ✓
2. You struggle to translate it smoothly to English ✓
3. The concept "lives" in Korean mental space ✓
4. English feels like scaffolding you could remove ✓

**This is the goal.**

---

## Version

**Korean JIT Sentence Explicator v1.0**  
_Optimized for JIT learning with L′-internal semantic grounding_

---

## Template Invocation Format

To use this template, submit:

```markdown
S: [sentence]
P: [comprehension state]
Execute: Korean JIT Explicator T
```

The explainer will then produce structured output following sections 1-10 above.
