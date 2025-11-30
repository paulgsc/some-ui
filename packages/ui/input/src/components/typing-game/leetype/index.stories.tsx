import type { Meta as MetaObj, StoryObj } from "@storybook/react-vite"

import { Leetype } from "."

type Story = StoryObj<typeof Leetype>
type Meta = MetaObj<typeof Leetype>

// Sample code snippets for different languages
const codeSamples = {
  typescript: {
    title: "Binary Search Implementation",
    description: "Classic algorithm with TypeScript types",
    code: `function binarySearch<T>(arr: T[], target: T): number {
  let left = 0;
  let right = arr.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    
    if (arr[mid] === target) {
      return mid;
    }
    
    if (arr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return -1;
}

export default binarySearch;`,
  },
  rust: {
    title: "Fibonacci Sequence",
    description: "Recursive implementation in Rust",
    code: `fn fibonacci(n: u32) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn main() {
    for i in 0..10 {
        println!("fib({}) = {}", i, fibonacci(i));
    }
}`,
  },
  cpp: {
    title: "Merge Sort Algorithm",
    description: "Divide and conquer sorting in C++",
    code: `#include <vector>

void merge(std::vector<int>& arr, int left, int mid, int right) {
    std::vector<int> temp(right - left + 1);
    int i = left, j = mid + 1, k = 0;
    
    while (i <= mid && j <= right) {
        if (arr[i] <= arr[j]) {
            temp[k++] = arr[i++];
        } else {
            temp[k++] = arr[j++];
        }
    }
    
    while (i <= mid) temp[k++] = arr[i++];
    while (j <= right) temp[k++] = arr[j++];
    
    for (i = 0; i < k; i++) {
        arr[left + i] = temp[i];
    }
}

void mergeSort(std::vector<int>& arr, int left, int right) {
    if (left < right) {
        int mid = left + (right - left) / 2;
        mergeSort(arr, left, mid);
        mergeSort(arr, mid + 1, right);
        merge(arr, left, mid, right);
    }
}`,
  },
  c: {
    title: "Linked List Operations",
    description: "Basic data structure in C",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node* next;
} Node;

Node* createNode(int data) {
    Node* newNode = (Node*)malloc(sizeof(Node));
    newNode->data = data;
    newNode->next = NULL;
    return newNode;
}

void insertAtHead(Node** head, int data) {
    Node* newNode = createNode(data);
    newNode->next = *head;
    *head = newNode;
}

void printList(Node* head) {
    Node* current = head;
    while (current != NULL) {
        printf("%d -> ", current->data);
        current = current->next;
    }
    printf("NULL\\n");
}`,
  },
}

const shortCodeSamples = {
  typescript: {
    title: "Quick Array Sum",
    description: "Simple reduce operation",
    code: `const sum = (arr: number[]): number => {
  return arr.reduce((a, b) => a + b, 0);
};`,
  },
  rust: {
    title: "Hello World",
    description: "Your first Rust program",
    code: `fn main() {
    println!("Hello, world!");
}`,
  },
  cpp: {
    title: "Max of Two Numbers",
    description: "Template function in C++",
    code: `template<typename T>
T max(T a, T b) {
    return (a > b) ? a : b;
}`,
  },
  c: {
    title: "Swap Function",
    description: "Using pointers",
    code: `void swap(int* a, int* b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}`,
  },
}

const complexCodeSamples = {
  typescript: {
    title: "React Custom Hook",
    description: "useDebounce with TypeScript",
    code: `import { useEffect, useState } from 'react';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Usage example
function SearchComponent() {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 500);

  useEffect(() => {
    if (debouncedSearch) {
      // Perform search operation
      console.log('Searching for:', debouncedSearch);
    }
  }, [debouncedSearch]);

  return (
    <input
      type="text"
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
    />
  );
}

export default useDebounce;`,
  },
  rust: {
    title: "Binary Tree Implementation",
    description: "Generic tree with traversal methods",
    code: `use std::cmp::Ordering;

#[derive(Debug)]
struct TreeNode<T> {
    value: T,
    left: Option<Box<TreeNode<T>>>,
    right: Option<Box<TreeNode<T>>>,
}

impl<T: Ord> TreeNode<T> {
    fn new(value: T) -> Self {
        TreeNode {
            value,
            left: None,
            right: None,
        }
    }

    fn insert(&mut self, value: T) {
        match value.cmp(&self.value) {
            Ordering::Less => {
                if let Some(ref mut left) = self.left {
                    left.insert(value);
                } else {
                    self.left = Some(Box::new(TreeNode::new(value)));
                }
            }
            Ordering::Greater => {
                if let Some(ref mut right) = self.right {
                    right.insert(value);
                } else {
                    self.right = Some(Box::new(TreeNode::new(value)));
                }
            }
            Ordering::Equal => {}
        }
    }

    fn contains(&self, value: &T) -> bool {
        match value.cmp(&self.value) {
            Ordering::Equal => true,
            Ordering::Less => {
                self.left.as_ref().map_or(false, |n| n.contains(value))
            }
            Ordering::Greater => {
                self.right.as_ref().map_or(false, |n| n.contains(value))
            }
        }
    }
}`,
  },
  cpp: {
    title: "Graph Dijkstra's Algorithm",
    description: "Shortest path implementation",
    code: `#include <vector>
#include <queue>
#include <limits>

using namespace std;

class Graph {
private:
    int V;
    vector<vector<pair<int, int>>> adj;

public:
    Graph(int vertices) : V(vertices) {
        adj.resize(V);
    }

    void addEdge(int u, int v, int weight) {
        adj[u].push_back({v, weight});
        adj[v].push_back({u, weight});
    }

    vector<int> dijkstra(int src) {
        vector<int> dist(V, numeric_limits<int>::max());
        priority_queue<pair<int, int>, 
                       vector<pair<int, int>>, 
                       greater<pair<int, int>>> pq;

        dist[src] = 0;
        pq.push({0, src});

        while (!pq.empty()) {
            int u = pq.top().second;
            pq.pop();

            for (auto& edge : adj[u]) {
                int v = edge.first;
                int weight = edge.second;

                if (dist[u] + weight < dist[v]) {
                    dist[v] = dist[u] + weight;
                    pq.push({dist[v], v});
                }
            }
        }

        return dist;
    }
};`,
  },
  c: {
    title: "Hash Table Implementation",
    description: "Chaining collision resolution",
    code: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define TABLE_SIZE 100

typedef struct Entry {
    char* key;
    int value;
    struct Entry* next;
} Entry;

typedef struct {
    Entry* buckets[TABLE_SIZE];
} HashTable;

unsigned int hash(const char* key) {
    unsigned int hash = 0;
    while (*key) {
        hash = (hash << 5) + *key++;
    }
    return hash % TABLE_SIZE;
}

HashTable* createTable() {
    HashTable* table = malloc(sizeof(HashTable));
    for (int i = 0; i < TABLE_SIZE; i++) {
        table->buckets[i] = NULL;
    }
    return table;
}

void insert(HashTable* table, const char* key, int value) {
    unsigned int index = hash(key);
    Entry* entry = malloc(sizeof(Entry));
    entry->key = strdup(key);
    entry->value = value;
    entry->next = table->buckets[index];
    table->buckets[index] = entry;
}

int get(HashTable* table, const char* key) {
    unsigned int index = hash(key);
    Entry* entry = table->buckets[index];
    
    while (entry != NULL) {
        if (strcmp(entry->key, key) == 0) {
            return entry->value;
        }
        entry = entry->next;
    }
    
    return -1;
}`,
  },
}

// Default story with standard code samples
export const Default: Story = {
  args: {
    source: codeSamples,
  },
}

// Beginner-friendly short snippets
export const ShortSnippets: Story = {
  args: {
    source: shortCodeSamples,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Perfect for beginners or quick practice sessions with shorter, simpler code snippets.",
      },
    },
  },
}

// Advanced complex algorithms
export const ComplexAlgorithms: Story = {
  args: {
    source: complexCodeSamples,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Challenge yourself with advanced data structures and algorithms across multiple languages.",
      },
    },
  },
}

// TypeScript-only focused practice
export const TypeScriptOnly: Story = {
  args: {
    source: {
      typescript: codeSamples.typescript,
      rust: codeSamples.typescript,
      cpp: codeSamples.typescript,
      c: codeSamples.typescript,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Focus exclusively on TypeScript with the same code across all language selections.",
      },
    },
  },
}

// LeetCode-style problems
export const LeetCodeStyle: Story = {
  args: {
    source: {
      typescript: {
        title: "Two Sum Problem",
        description: "LeetCode #1 - Array & Hash Table",
        code: `/**
 * Given an array of integers nums and an integer target,
 * return indices of the two numbers such that they add up to target.
 */
function twoSum(nums: number[], target: number): number[] {
  const map = new Map<number, number>();
  
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    
    if (map.has(complement)) {
      return [map.get(complement)!, i];
    }
    
    map.set(nums[i], i);
  }
  
  return [];
}

// Example usage:
console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
console.log(twoSum([3, 2, 4], 6));      // [1, 2]`,
      },
      rust: {
        title: "Valid Palindrome",
        description: "LeetCode #125 - Two Pointers",
        code: `impl Solution {
    pub fn is_palindrome(s: String) -> bool {
        let chars: Vec<char> = s
            .chars()
            .filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_lowercase())
            .collect();
        
        let mut left = 0;
        let mut right = chars.len().saturating_sub(1);
        
        while left < right {
            if chars[left] != chars[right] {
                return false;
            }
            left += 1;
            right -= 1;
        }
        
        true
    }
}`,
      },
      cpp: {
        title: "Reverse Linked List",
        description: "LeetCode #206 - Linked List",
        code: `/**
 * Definition for singly-linked list.
 */
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};

class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* curr = head;
        
        while (curr != nullptr) {
            ListNode* nextTemp = curr->next;
            curr->next = prev;
            prev = curr;
            curr = nextTemp;
        }
        
        return prev;
    }
};`,
      },
      c: {
        title: "Maximum Subarray",
        description: "LeetCode #53 - Kadane's Algorithm",
        code: `int maxSubArray(int* nums, int numsSize) {
    int maxSum = nums[0];
    int currentSum = nums[0];
    
    for (int i = 1; i < numsSize; i++) {
        currentSum = (nums[i] > currentSum + nums[i]) 
            ? nums[i] 
            : currentSum + nums[i];
        
        if (currentSum > maxSum) {
            maxSum = currentSum;
        }
    }
    
    return maxSum;
}`,
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Practice with LeetCode-style algorithm problems across different programming languages.",
      },
    },
  },
}

// Real-world API examples
export const RealWorldAPI: Story = {
  args: {
    source: {
      typescript: {
        title: "REST API Client",
        description: "Fetch with error handling and types",
        code: `interface ApiResponse<T> {
  data: T;
  error?: string;
  status: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(\`\${this.baseUrl}\${endpoint}\`);
      const data = await response.json();
      
      return {
        data,
        status: response.status,
      };
    } catch (error) {
      return {
        data: null as T,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 500,
      };
    }
  }

  async post<T>(endpoint: string, body: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(\`\${this.baseUrl}\${endpoint}\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return { data, status: response.status };
  }
}`,
      },
      rust: {
        title: "HTTP Server Route Handler",
        description: "Actix-web request handling",
        code: `use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct CreateUser {
    name: String,
    email: String,
}

#[derive(Serialize)]
struct User {
    id: u32,
    name: String,
    email: String,
}

async fn create_user(
    user: web::Json<CreateUser>
) -> Result<HttpResponse> {
    let new_user = User {
        id: 1,
        name: user.name.clone(),
        email: user.email.clone(),
    };
    
    Ok(HttpResponse::Created().json(new_user))
}

async fn get_user(
    user_id: web::Path<u32>
) -> Result<HttpResponse> {
    let user = User {
        id: *user_id,
        name: "John Doe".to_string(),
        email: "john@example.com".to_string(),
    };
    
    Ok(HttpResponse::Ok().json(user))
}`,
      },
      cpp: {
        title: "JSON Parser",
        description: "Simple JSON parsing in C++",
        code: `#include <string>
#include <map>
#include <variant>
#include <vector>

using JsonValue = std::variant<
    std::string,
    int,
    double,
    bool,
    std::nullptr_t
>;

class JsonParser {
private:
    std::string json;
    size_t pos = 0;

public:
    JsonParser(const std::string& input) : json(input) {}

    std::map<std::string, JsonValue> parse() {
        std::map<std::string, JsonValue> result;
        skipWhitespace();
        
        if (json[pos] != '{') {
            throw std::runtime_error("Expected '{'");
        }
        pos++;
        
        while (pos < json.length() && json[pos] != '}') {
            skipWhitespace();
            std::string key = parseString();
            skipWhitespace();
            
            if (json[pos] != ':') {
                throw std::runtime_error("Expected ':'");
            }
            pos++;
            
            skipWhitespace();
            JsonValue value = parseValue();
            result[key] = value;
            
            skipWhitespace();
            if (json[pos] == ',') pos++;
        }
        
        return result;
    }

private:
    void skipWhitespace() {
        while (pos < json.length() && 
               std::isspace(json[pos])) {
            pos++;
        }
    }

    std::string parseString() {
        // Implementation details...
        return "";
    }

    JsonValue parseValue() {
        // Implementation details...
        return nullptr;
    }
};`,
      },
      c: {
        title: "TCP Socket Server",
        description: "Basic network programming",
        code: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <arpa/inet.h>
#include <unistd.h>

#define PORT 8080
#define BUFFER_SIZE 1024

int create_server() {
    int server_fd, client_fd;
    struct sockaddr_in address;
    int addrlen = sizeof(address);
    char buffer[BUFFER_SIZE] = {0};
    
    // Create socket
    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) {
        perror("socket failed");
        exit(EXIT_FAILURE);
    }
    
    // Configure address
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);
    
    // Bind socket
    if (bind(server_fd, (struct sockaddr*)&address, 
             sizeof(address)) < 0) {
        perror("bind failed");
        exit(EXIT_FAILURE);
    }
    
    // Listen for connections
    if (listen(server_fd, 3) < 0) {
        perror("listen failed");
        exit(EXIT_FAILURE);
    }
    
    printf("Server listening on port %d\\n", PORT);
    
    // Accept connection
    client_fd = accept(server_fd, 
                       (struct sockaddr*)&address,
                       (socklen_t*)&addrlen);
    
    if (client_fd < 0) {
        perror("accept failed");
        exit(EXIT_FAILURE);
    }
    
    // Read data
    read(client_fd, buffer, BUFFER_SIZE);
    printf("Received: %s\\n", buffer);
    
    return 0;
}`,
      },
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Practice typing real-world code examples like API clients, servers, and network programming.",
      },
    },
  },
}

export default {
  title: "UI/Input/Components/Typing/Leetype",
  component: Leetype,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "A code typing game component that helps developers improve their typing speed and accuracy with various programming languages.",
      },
    },
  },
  argTypes: {
    source: {
      description: "Code samples for each supported language",
      control: false,
    },
  },
} as Meta
