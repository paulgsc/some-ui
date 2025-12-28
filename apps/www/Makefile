# Makefile for Docker operations
# Variables
DOCKER_USERNAME ?= your-username
IMAGE_NAME ?= my-app
TAG ?= latest
FULL_IMAGE_NAME = $(DOCKER_USERNAME)/$(IMAGE_NAME):$(TAG)

# Docker registry (default to Docker Hub)
REGISTRY ?= docker.io

# Platform for multi-arch builds (optional)
PLATFORM ?= linux/amd64,linux/arm64

# Colors for output
RED = \033[0;31m
GREEN = \033[0;32m
YELLOW = \033[1;33m
BLUE = \033[0;34m
NC = \033[0m # No Color

.PHONY: help build run stop clean push pull login logout tag dev prod multi-build health logs shell

# Default target
help: ## Show this help message
	@echo "$(BLUE)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

# Build the Docker image
build: ## Build the Docker image
	@echo "$(BLUE)Building Docker image: $(FULL_IMAGE_NAME)$(NC)"
	docker build -t $(FULL_IMAGE_NAME) .
	@echo "$(GREEN)Build completed successfully!$(NC)"

# Build with no cache
build-no-cache: ## Build the Docker image without cache
	@echo "$(BLUE)Building Docker image without cache: $(FULL_IMAGE_NAME)$(NC)"
	docker build --no-cache -t $(FULL_IMAGE_NAME) .
	@echo "$(GREEN)Build completed successfully!$(NC)"

# Build for multiple platforms
multi-build: ## Build multi-platform image (requires buildx)
	@echo "$(BLUE)Building multi-platform image: $(FULL_IMAGE_NAME)$(NC)"
	docker buildx build --platform $(PLATFORM) -t $(FULL_IMAGE_NAME) --push .
	@echo "$(GREEN)Multi-platform build completed and pushed!$(NC)"

# Run the container
run: ## Run the container on port 8080
	@echo "$(BLUE)Running container: $(FULL_IMAGE_NAME)$(NC)"
	docker run -d --name $(IMAGE_NAME) -p 8080:80 $(FULL_IMAGE_NAME)
	@echo "$(GREEN)Container is running at http://localhost:8080$(NC)"

# Run in development mode with volume mounting
dev: ## Run container with volume mounting for development
	@echo "$(BLUE)Running container in development mode$(NC)"
	docker run -d --name $(IMAGE_NAME)-dev -p 8080:80 \
		-v $(PWD)/dist:/usr/share/nginx/html:ro \
		$(FULL_IMAGE_NAME)
	@echo "$(GREEN)Development container is running at http://localhost:8080$(NC)"

# Stop and remove the container
stop: ## Stop and remove the running container
	@echo "$(YELLOW)Stopping container: $(IMAGE_NAME)$(NC)"
	-docker stop $(IMAGE_NAME)
	-docker rm $(IMAGE_NAME)
	-docker stop $(IMAGE_NAME)-dev
	-docker rm $(IMAGE_NAME)-dev
	@echo "$(GREEN)Container stopped and removed$(NC)"

# Clean up containers and images
clean: stop ## Clean up containers, images, and build cache
	@echo "$(YELLOW)Cleaning up Docker resources$(NC)"
	-docker rmi $(FULL_IMAGE_NAME)
	-docker system prune -f
	@echo "$(GREEN)Cleanup completed$(NC)"

# Deep clean (remove all unused resources)
deep-clean: ## Remove all unused Docker resources
	@echo "$(RED)Performing deep clean of Docker resources$(NC)"
	-docker system prune -a -f --volumes
	@echo "$(GREEN)Deep clean completed$(NC)"

# Tag the image
tag: ## Tag the image with additional tag
	@read -p "Enter additional tag: " ADDITIONAL_TAG; \
	docker tag $(FULL_IMAGE_NAME) $(DOCKER_USERNAME)/$(IMAGE_NAME):$$ADDITIONAL_TAG
	@echo "$(GREEN)Image tagged successfully$(NC)"

# Login to Docker Hub
login: ## Login to Docker Hub
	@echo "$(BLUE)Logging in to Docker Hub$(NC)"
	docker login $(REGISTRY)

# Logout from Docker Hub
logout: ## Logout from Docker Hub
	@echo "$(BLUE)Logging out from Docker Hub$(NC)"
	docker logout $(REGISTRY)

# Push image to Docker Hub
push: ## Push the image to Docker Hub
	@echo "$(BLUE)Pushing image: $(FULL_IMAGE_NAME)$(NC)"
	docker push $(FULL_IMAGE_NAME)
	@echo "$(GREEN)Image pushed successfully!$(NC)"

# Push with build
push-latest: build push ## Build and push the latest image

# Pull image from Docker Hub
pull: ## Pull the image from Docker Hub
	@echo "$(BLUE)Pulling image: $(FULL_IMAGE_NAME)$(NC)"
	docker pull $(FULL_IMAGE_NAME)
	@echo "$(GREEN)Image pulled successfully!$(NC)"

# Health check
health: ## Check container health status
	@echo "$(BLUE)Checking container health$(NC)"
	@docker inspect --format='{{.State.Health.Status}}' $(IMAGE_NAME) 2>/dev/null || echo "Container not found or no health check configured"

# Show container logs
logs: ## Show container logs
	@echo "$(BLUE)Showing logs for container: $(IMAGE_NAME)$(NC)"
	docker logs -f $(IMAGE_NAME)

# Execute shell in running container
shell: ## Execute shell in the running container
	@echo "$(BLUE)Opening shell in container: $(IMAGE_NAME)$(NC)"
	docker exec -it $(IMAGE_NAME) /bin/sh

# Show running containers
ps: ## Show running containers
	@echo "$(BLUE)Running containers:$(NC)"
	docker ps --filter name=$(IMAGE_NAME)

# Show image info
info: ## Show image information
	@echo "$(BLUE)Image information:$(NC)"
	docker images $(FULL_IMAGE_NAME)
	@echo "\n$(BLUE)Image layers:$(NC)"
	docker history $(FULL_IMAGE_NAME)

# Release workflow (build, tag, push)
release: ## Build, tag and push release version
	@read -p "Enter release version (e.g., v1.0.0): " VERSION; \
	docker build -t $(DOCKER_USERNAME)/$(IMAGE_NAME):$$VERSION -t $(FULL_IMAGE_NAME) .; \
	docker push $(DOCKER_USERNAME)/$(IMAGE_NAME):$$VERSION; \
	docker push $(FULL_IMAGE_NAME)
	@echo "$(GREEN)Release completed successfully!$(NC)"

# Quick development cycle
dev-cycle: stop build run ## Stop, build, and run for quick development

# Production deployment
prod: ## Build and run production container
	@echo "$(BLUE)Deploying production container$(NC)"
	$(MAKE) stop
	$(MAKE) build TAG=prod
	docker run -d --name $(IMAGE_NAME)-prod -p 80:80 --restart unless-stopped $(DOCKER_USERNAME)/$(IMAGE_NAME):prod
	@echo "$(GREEN)Production container deployed on port 80$(NC)"

# Backup image
backup: ## Save image to tar file
	@echo "$(BLUE)Backing up image to tar file$(NC)"
	docker save $(FULL_IMAGE_NAME) | gzip > $(IMAGE_NAME)-$(TAG)-backup.tar.gz
	@echo "$(GREEN)Image backed up to $(IMAGE_NAME)-$(TAG)-backup.tar.gz$(NC)"

# Restore image from backup
restore: ## Load image from tar file
	@echo "$(BLUE)Restoring image from backup$(NC)"
	@read -p "Enter backup file path: " BACKUP_FILE; \
	gunzip -c $$BACKUP_FILE | docker load
	@echo "$(GREEN)Image restored from backup$(NC)"

# Security scan (requires Docker Scout or similar)
scan: ## Scan image for vulnerabilities
	@echo "$(BLUE)Scanning image for vulnerabilities$(NC)"
	@if command -v docker-scout >/dev/null 2>&1; then \
		docker scout cves $(FULL_IMAGE_NAME); \
	else \
		echo "$(YELLOW)Docker Scout not installed. Install it for vulnerability scanning.$(NC)"; \
	fi
