sets up a sandbox Kubernetes cluster with Kind and bootstraps ArgoCD:

```bash
#!/bin/bash

# colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default configuration
CLUSTER_NAME="sandbox-cluster"
KIND_CONFIG_FILE="kind-config.yaml"
ARGOCD_VERSION="2.10.0"
ARGOCD_NAMESPACE="argocd"
ARGOCD_PORT="8080"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    local missing_deps=()
    
    # Check for Docker
    if ! command_exists docker; then
        missing_deps+=("Docker")
    else
        # Check if Docker daemon is running
        if ! docker info >/dev/null 2>&1; then
            print_error "Docker daemon is not running. Please start Docker."
            exit 1
        fi
    fi
    
    # Check for kubectl
    if ! command_exists kubectl; then
        print_warn "kubectl not found. Installing..."
        install_kubectl
    fi
    
    # Check for kind
    if ! command_exists kind; then
        print_warn "kind not found. Installing..."
        install_kind
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi
    
    print_info "All prerequisites satisfied!"
}

# Install kubectl
install_kubectl() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        chmod +x kubectl
        sudo mv kubectl /usr/local/bin/
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install kubectl
        else
            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/amd64/kubectl"
            chmod +x kubectl
            sudo mv kubectl /usr/local/bin/
        fi
    else
        print_error "Unsupported OS for automatic kubectl installation"
        exit 1
    fi
}

# Install kind
install_kind() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
        chmod +x ./kind
        sudo mv ./kind /usr/local/bin/kind
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command_exists brew; then
            brew install kind
        else
            curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-darwin-amd64
            chmod +x ./kind
            sudo mv ./kind /usr/local/bin/kind
        fi
    else
        print_error "Unsupported OS for automatic kind installation"
        exit 1
    fi
}

# Create Kind configuration
create_kind_config() {
    cat > "$KIND_CONFIG_FILE" << EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: $CLUSTER_NAME
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30000
    hostPort: 30000
    protocol: TCP
  - containerPort: 30001
    hostPort: 30001
    protocol: TCP
  - containerPort: 30002
    hostPort: 30002
    protocol: TCP
  - containerPort: 30003
    hostPort: 30003
    protocol: TCP
EOF
    print_info "Created Kind configuration: $KIND_CONFIG_FILE"
}

# Create Kubernetes cluster with Kind
create_cluster() {
    if kind get clusters | grep -q "$CLUSTER_NAME"; then
        print_warn "Cluster '$CLUSTER_NAME' already exists. Skipping creation."
        return
    fi
    
    print_info "Creating Kind cluster: $CLUSTER_NAME"
    create_kind_config
    kind create cluster --config "$KIND_CONFIG_FILE" --name "$CLUSTER_NAME"
    
    if [ $? -eq 0 ]; then
        print_info "Cluster created successfully!"
        
        # Set kubectl context
        kubectl cluster-info --context "kind-$CLUSTER_NAME"
        
        # Wait for nodes to be ready
        print_info "Waiting for nodes to be ready..."
        kubectl wait --for=condition=Ready nodes --all --timeout=300s
    else
        print_error "Failed to create cluster"
        exit 1
    fi
}

# Install ArgoCD
install_argocd() {
    print_info "Installing ArgoCD version $ARGOCD_VERSION..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$ARGOCD_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Install ArgoCD using manifest
    kubectl apply -n "$ARGOCD_NAMESPACE" -f "https://raw.githubusercontent.com/argoproj/argo-cd/v${ARGOCD_VERSION}/manifests/install.yaml"
    
    if [ $? -eq 0 ]; then
        print_info "ArgoCD installed successfully!"
    else
        print_error "Failed to install ArgoCD"
        exit 1
    fi
}

# Wait for ArgoCD to be ready
wait_for_argocd() {
    print_info "Waiting for ArgoCD to be ready..."
    
    # Wait for deployments
    local deployments=("argocd-server" "argocd-redis" "argocd-repo-server" "argocd-dex-server" "argocd-applicationset-controller")
    
    for deployment in "${deployments[@]}"; do
        print_info "Waiting for $deployment..."
        kubectl wait --for=condition=available deployment/"$deployment" -n "$ARGOCD_NAMESPACE" --timeout=300s
    done
    
    print_info "ArgoCD is ready!"
}

# Get ArgoCD admin password
get_argocd_password() {
    print_info "Getting ArgoCD admin password..."
    
    # The initial password is the name of the argocd-server pod
    ARGOCD_PASSWORD=$(kubectl -n "$ARGOCD_NAMESPACE" get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d 2>/dev/null)
    
    if [ -z "$ARGOCD_PASSWORD" ]; then
        print_warn "Could not retrieve ArgoCD password. You may need to reset it manually."
        ARGOCD_PASSWORD="<not-available>"
    else
        print_info "ArgoCD admin password retrieved"
    fi
}

# Port forward ArgoCD server
port_forward_argocd() {
    print_info "Setting up port forwarding for ArgoCD UI..."
    print_info "ArgoCD UI will be available at: http://localhost:$ARGOCD_PORT"
    
    # Kill existing port-forward if any
    pkill -f "kubectl port-forward svc/argocd-server" 2>/dev/null || true
    
    # Start port-forward in background
    kubectl port-forward svc/argocd-server -n "$ARGOCD_NAMESPACE" "$ARGOCD_PORT:443" > /dev/null 2>&1 &
    
    # Wait a moment for port-forward to establish
    sleep 5
}

# Install ArgoCD CLI (optional)
install_argocd_cli() {
    if command_exists argocd; then
        print_info "ArgoCD CLI already installed"
        return
    fi
    
    print_info "Installing ArgoCD CLI..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/download/v${ARGOCD_VERSION}/argocd-linux-amd64
        sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
        rm argocd-linux-amd64
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        if command_exists brew; then
            brew install argocd
        else
            curl -sSL -o argocd-darwin-amd64 https://github.com/argoproj/argo-cd/releases/download/v${ARGOCD_VERSION}/argocd-darwin-amd64
            sudo install -m 555 argocd-darwin-amd64 /usr/local/bin/argocd
            rm argocd-darwin-amd64
        fi
    else
        print_warn "Skipping ArgoCD CLI installation (unsupported OS)"
    fi
}

# Create sample application (optional)
create_sample_app() {
    print_info "Creating sample ArgoCD application..."
    
    cat > sample-app.yaml << EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: $ARGOCD_NAMESPACE
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
EOF
    
    kubectl apply -f sample-app.yaml
    print_info "Sample application 'guestbook' created"
}

# Print summary
print_summary() {
    echo -e "\n${GREEN}=========================================="
    echo "      SANDBOX CLUSTER SETUP COMPLETE"
    echo "==========================================${NC}\n"
    
    echo -e "${YELLOW}CLUSTER INFORMATION:${NC}"
    echo "  Cluster Name: $CLUSTER_NAME"
    echo "  Context: kind-$CLUSTER_NAME"
    
    echo -e "\n${YELLOW}ARGOCD INFORMATION:${NC}"
    echo "  Namespace: $ARGOCD_NAMESPACE"
    echo "  UI URL: http://localhost:$ARGOCD_PORT"
    echo "  Username: admin"
    echo "  Password: $ARGOCD_PASSWORD"
    
    echo -e "\n${YELLOW}NEXT STEPS:${NC}"
    echo "  1. Access ArgoCD UI at: http://localhost:$ARGOCD_PORT"
    echo "  2. Login with username: admin, password: $ARGOCD_PASSWORD"
    echo "  3. Consider changing the default password"
    echo "  4. Check sample application: kubectl get applications -n $ARGOCD_NAMESPACE"
    
    echo -e "\n${YELLOW}USEFUL COMMANDS:${NC}"
    echo "  View all pods: kubectl get pods -A"
    echo "  View ArgoCD pods: kubectl get pods -n $ARGOCD_NAMESPACE"
    echo "  Get ArgoCD password again: kubectl -n $ARGOCD_NAMESPACE get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
    echo "  Delete cluster: kind delete cluster --name $CLUSTER_NAME"
    
    echo -e "\n${GREEN}Setup complete! Enjoy your sandbox environment!${NC}\n"
}

# Cleanup function
cleanup() {
    print_info "Cleaning up..."
    
    # Kill background port-forward
    pkill -f "kubectl port-forward svc/argocd-server" 2>/dev/null || true
    
    # Remove temporary files
    rm -f "$KIND_CONFIG_FILE" sample-app.yaml 2>/dev/null || true
}

# Main execution
main() {
    print_info "Starting sandbox Kubernetes cluster setup with Kind and ArgoCD"
    
    # Set trap for cleanup on exit
    trap cleanup EXIT
    
    # Step 1: Check prerequisites
    check_prerequisites
    
    # Step 2: Create cluster
    create_cluster
    
    # Step 3: Install ArgoCD
    install_argocd
    
    # Step 4: Wait for ArgoCD
    wait_for_argocd
    
    # Step 5: Get password
    get_argocd_password
    
    # Step 6: Install ArgoCD CLI (optional)
    read -p "Install ArgoCD CLI? (y/n, default: n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        install_argocd_cli
    fi
    
    # Step 7: Create sample application (optional)
    read -p "Create sample ArgoCD application? (y/n, default: n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        create_sample_app
    fi
    
    # Step 8: Setup port forwarding
    port_forward_argocd
    
    # Step 9: Print summary
    print_summary
    
    # Keep script running to maintain port-forward
    print_info "Press Ctrl+C to stop port-forwarding and exit"
    wait
}

# Run main function
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
```

Installation and Usage Instructions:

1. Save the script to a file (e.g., sandbox-bootstrap.sh)
2. Make it executable:

```bash
chmod +x sandbox-bootstrap.sh
```

1. Run the script:

```bash
./sandbox-bootstrap.sh
```

Features Included:

1. Prerequisites Checking: Automatically checks for Docker, kubectl, and kind
2. Auto-installation: Can install missing dependencies (kubectl and kind)
3. Kind Cluster Creation: Creates a Kubernetes cluster with:
   · Control-plane node
   · Pre-configured port mappings for services (30000-30003)
4. ArgoCD Installation: Installs the latest stable version of ArgoCD
5. Automatic Setup:
   · Waits for all ArgoCD components to be ready
   · Retrieves the admin password
   · Sets up port forwarding for the ArgoCD UI
6. Optional Components:
   · ArgoCD CLI installation
   · Sample application creation
7. Clean Output: Color-coded messages for better readability
8. Cleanup: Proper cleanup on script termination

Post-Installation:

After the script runs successfully:

1. Access ArgoCD UI at: http://localhost:8080
2. Login with:
   · Username: admin
   · Password: (displayed in the terminal output)
3. Manage your cluster using:
   · ArgoCD UI for GitOps workflows
   · kubectl commands directly

Customization:

You can modify the following variables at the top of the script:

· CLUSTER_NAME: Name of your Kind cluster
· ARGOCD_VERSION: ArgoCD version to install
· ARGOCD_PORT: Local port for ArgoCD UI access
· ARGOCD_NAMESPACE: Namespace for ArgoCD installation

This script provides a complete, production-like sandbox environment for testing GitOps workflows with ArgoCD on a local Kubernetes cluster.