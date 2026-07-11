
# ------------------------------------------------------------
# Docker Configuration
# ------------------------------------------------------------
IMAGE_NAME       ?= 
DOCKER_REPO      ?= paulgsc/$(IMAGE_NAME)
DOCKERFILE_PATH  ?= 
TAG              := latest

# Get git metadata for dynamic version tagging
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH := $(shell git branch --show-current 2>/dev/null || echo "main")

# Colors for terminal styling
CYAN   = \033[36m
GREEN  = \033[32m
YELLOW = \033[33m
RED    = \033[31m
NC     = \033[0m

.PHONY: help login build build-no-cache push deploy pull run stop clean cleanup build-multi shell logs check

# ------------------------------------------------------------
# Guard Macros for Variable Validation
# ------------------------------------------------------------
define check_vars
	@if [ -z "$(IMAGE_NAME)" ]; then echo "$(RED)Error: IMAGE_NAME is empty.$(NC)\nUsage: make $(1) IMAGE_NAME=www DOCKERFILE_PATH=apps/www/Dockerfile"; exit 1; fi
	@if [ -z "$(DOCKERFILE_PATH)" ]; then echo "$(RED)Error: DOCKERFILE_PATH is empty.$(NC)\nUsage: make $(1) IMAGE_NAME=www DOCKERFILE_PATH=apps/www/Dockerfile"; exit 1; fi
endef

# ------------------------------------------------------------
# Available Targets
# ------------------------------------------------------------
help: ## Show this help message
	@echo "$(CYAN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-15s$(NC) %s\n", $$1, $$2}'

login: ## Login to Docker Hub
	@echo "Logging into Docker Hub..."
	@docker login

build: ## Build the Docker image using local layer caching
	$(call check_vars,$@)
	@echo "Building Docker image: $(DOCKER_REPO):$(TAG)"
	docker build -f $(DOCKERFILE_PATH) -t $(DOCKER_REPO):$(TAG) .
	docker tag $(DOCKER_REPO):$(TAG) $(DOCKER_REPO):dev-$(GIT_COMMIT)
	@echo "$(GREEN)Built images:$(NC)"
	@echo "  - $(DOCKER_REPO):$(TAG)"
	@echo "  - $(DOCKER_REPO):dev-$(GIT_COMMIT)"

build-no-cache: ## Force complete rebuild without layer caching
	$(call check_vars,$@)
	@echo "Building Docker image without cache: $(DOCKER_REPO):$(TAG)"
	docker build --no-cache -f $(DOCKERFILE_PATH) -t $(DOCKER_REPO):$(TAG) .
	docker tag $(DOCKER_REPO):$(TAG) $(DOCKER_REPO):dev-$(GIT_COMMIT)
	@echo "$(GREEN)Rebuilt images from scratch!$(NC)"

push: ## Push the built images to Docker Hub
	$(call check_vars,$@)
	@echo "Pushing Docker images to Docker Hub..."
	docker push $(DOCKER_REPO):$(TAG)
	docker push $(DOCKER_REPO):dev-$(GIT_COMMIT)
	@echo "$(GREEN)Successfully pushed images$(NC)"

deploy: login build push ## One command workflow: Login, build, and push target image
	@echo "🚀 $(GREEN)Deploy complete! Your target env can now execute:$(NC)"
	@echo "   docker pull $(DOCKER_REPO):$(TAG)"

pull: ## Pull the target image from Docker Hub
	$(call check_vars,$@)
	@echo "Pulling image from Docker Hub..."
	docker pull $(DOCKER_REPO):$(TAG)

run: stop ## Run the container locally (stops any active instance first)
	$(call check_vars,$@)
	@echo "Running container from $(DOCKER_REPO):$(TAG) on port 8080..."
	docker run -d --name $(IMAGE_NAME) -p 8080:80 $(DOCKER_REPO):$(TAG)

stop: ## Stop and remove the active local container container
	@if [ -n "$(IMAGE_NAME)" ]; then \
		echo "Stopping container $(IMAGE_NAME)..."; \
		docker stop $(IMAGE_NAME) 2>/dev/null || true; \
		docker rm $(IMAGE_NAME) 2>/dev/null || true; \
	fi

shell: ## Execute an interactive sh session inside the running container
	@if [ -z "$(IMAGE_NAME)" ]; then echo "$(RED)Error: Specify IMAGE_NAME to enter shell$(NC)"; exit 1; fi
	docker exec -it $(IMAGE_NAME) /bin/sh

logs: ## Stream log context out of the active container
	@if [ -z "$(IMAGE_NAME)" ]; then echo "$(RED)Error: Specify IMAGE_NAME to watch logs$(NC)"; exit 1; fi
	docker logs -f $(IMAGE_NAME)

clean: ## Remove current target variant tags from local image store
	$(call check_vars,$@)
	@echo "Cleaning local target images..."
	@docker rmi $(DOCKER_REPO):$(TAG) 2>/dev/null || true
	@docker rmi $(DOCKER_REPO):dev-$(GIT_COMMIT) 2>/dev/null || true

cleanup: ## Force eviction of unused BuildKit caches and dangling images
	@echo "$(YELLOW)Pruning dangling build contexts and layer environments...$(NC)"
	docker system prune -f
	docker image prune -f
	docker builder prune -f

build-multi: ## Build and push multi-platform images (linux/amd64, linux/arm64) via buildx
	$(call check_vars,$@)
	@echo "Building multi-platform image..."
	docker buildx build --platform linux/amd64,linux/arm64 -f $(DOCKERFILE_PATH) -t $(DOCKER_REPO):$(TAG) . --push

check: ## Check local engine image storage for reference matches
	$(call check_vars,$@)
	@docker images | grep $(DOCKER_REPO) || echo "$(YELLOW)No local images found for $(DOCKER_REPO)$(NC)"
