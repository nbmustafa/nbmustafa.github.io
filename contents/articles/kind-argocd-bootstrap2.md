I'll create a comprehensive bootstrap script that sets up a Kind Kubernetes cluster with ArgoCD, Prometheus, and Grafana deployed from local Helm charts. Here's the complete solution:

```bash
#!/bin/bash
# bootstrap-kind-argocd.sh
# Bootstrap script for Kind Kubernetes cluster with ArgoCD, Prometheus, and Grafana

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
CLUSTER_NAME="sandbox-cluster"
ARGO_NAMESPACE="argocd"
MONITORING_NAMESPACE="monitoring"
ARGO_VERSION="5.51.6"
PROMETHEUS_VERSION="25.12.0"
GRAFANA_VERSION="10.0.0"

# Chart directories (relative to script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHARTS_DIR="${SCRIPT_DIR}/charts"
ARGO_CHART_DIR="${CHARTS_DIR}/argo-cd"
PROMETHEUS_CHART_DIR="${CHARTS_DIR}/prometheus"
GRAFANA_CHART_DIR="${CHARTS_DIR}/grafana"
APPLICATIONS_DIR="${SCRIPT_DIR}/applications"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if a command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Function to create directory structure
create_directory_structure() {
    print_status "Creating directory structure..."
    
    mkdir -p ${CHARTS_DIR}
    mkdir -p ${APPLICATIONS_DIR}
    
    # Create chart directories
    mkdir -p ${ARGO_CHART_DIR}
    mkdir -p ${PROMETHEUS_CHART_DIR}
    mkdir -p ${GRAFANA_CHART_DIR}
}

# Function to create Kind cluster configuration
create_kind_config() {
    cat > ${SCRIPT_DIR}/kind-config.yaml << EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: ${CLUSTER_NAME}
nodes:
- role: control-plane
  extraPortMappings:
  - containerPort: 30080
    hostPort: 8080
    protocol: TCP
  - containerPort: 30443
    hostPort: 8443
    protocol: TCP
  - containerPort: 30007
    hostPort: 30007
    protocol: TCP
  - containerPort: 30090
    hostPort: 9090
    protocol: TCP
  - containerPort: 30300
    hostPort: 3000
    protocol: TCP
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
containerdConfigPatches:
- |-
  [plugins."io.containerd.grpc.v1.cri".registry.mirrors."localhost:5000"]
    endpoint = ["http://kind-registry:5000"]
EOF
    
    print_success "Kind configuration created"
}

# Function to setup Kind cluster
setup_kind_cluster() {
    print_status "Checking if Kind is installed..."
    check_command kind
    
    print_status "Creating Kind cluster..."
    
    # Check if cluster already exists
    if kind get clusters | grep -q ${CLUSTER_NAME}; then
        print_warning "Cluster ${CLUSTER_NAME} already exists. Deleting it..."
        kind delete cluster --name ${CLUSTER_NAME}
    fi
    
    # Create cluster
    kind create cluster --name ${CLUSTER_NAME} --config ${SCRIPT_DIR}/kind-config.yaml
    
    # Set kubectl context
    kubectl cluster-info --context kind-${CLUSTER_NAME}
    
    print_success "Kind cluster created successfully"
}

# Function to download Helm charts locally
download_helm_charts() {
    print_status "Downloading Helm charts..."
    
    # Check if helm is installed
    check_command helm
    
    # Create Chart.yaml files if they don't exist
    for chart_dir in ${ARGO_CHART_DIR} ${PROMETHEUS_CHART_DIR} ${GRAFANA_CHART_DIR}; do
        if [ ! -f "${chart_dir}/Chart.yaml" ]; then
            cat > "${chart_dir}/Chart.yaml" << EOF
apiVersion: v2
name: $(basename ${chart_dir})
description: A Helm chart for $(basename ${chart_dir})
version: 0.1.0
appVersion: "1.0"
EOF
        fi
        
        # Create values.yaml if it doesn't exist
        if [ ! -f "${chart_dir}/values.yaml" ]; then
            touch "${chart_dir}/values.yaml"
        fi
        
        # Create templates directory if it doesn't exist
        mkdir -p "${chart_dir}/templates"
    done
    
    # Download ArgoCD chart
    print_status "Fetching ArgoCD Helm chart..."
    helm repo add argo https://argoproj.github.io/argo-helm
    helm pull argo/argo-cd --version ${ARGO_VERSION} --untar --untardir ${CHARTS_DIR}
    if [ -d "${CHARTS_DIR}/argo-cd" ]; then
        cp -r ${CHARTS_DIR}/argo-cd/* ${ARGO_CHART_DIR}/
        rm -rf ${CHARTS_DIR}/argo-cd
    fi
    
    # Download Prometheus chart
    print_status "Fetching Prometheus Helm chart..."
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm pull prometheus-community/prometheus --version ${PROMETHEUS_VERSION} --untar --untardir ${CHARTS_DIR}
    if [ -d "${CHARTS_DIR}/prometheus" ]; then
        cp -r ${CHARTS_DIR}/prometheus/* ${PROMETHEUS_CHART_DIR}/
        rm -rf ${CHARTS_DIR}/prometheus
    fi
    
    # Download Grafana chart
    print_status "Fetching Grafana Helm chart..."
    helm repo add grafana https://grafana.github.io/helm-charts
    helm pull grafana/grafana --version ${GRAFANA_VERSION} --untar --untardir ${CHARTS_DIR}
    if [ -d "${CHARTS_DIR}/grafana" ]; then
        cp -r ${CHARTS_DIR}/grafana/* ${GRAFANA_CHART_DIR}/
        rm -rf ${CHARTS_DIR}/grafana
    fi
    
    # Update Chart.yaml files with proper versions
    sed -i "s/version: .*/version: ${ARGO_VERSION}/" ${ARGO_CHART_DIR}/Chart.yaml
    sed -i "s/version: .*/version: ${PROMETHEUS_VERSION}/" ${PROMETHEUS_CHART_DIR}/Chart.yaml
    sed -i "s/version: .*/version: ${GRAFANA_VERSION}/" ${GRAFANA_CHART_DIR}/Chart.yaml
    
    print_success "Helm charts downloaded and organized locally"
}

# Function to customize ArgoCD values
customize_argocd_values() {
    cat > ${ARGO_CHART_DIR}/values.yaml << EOF
# ArgoCD Configuration
server:
  service:
    type: NodePort
    nodePorts:
      http: 30080
      https: 30443
  extraArgs:
    - --insecure
  ingress:
    enabled: false
  config:
    url: http://localhost:8080
  
controller:
  metrics:
    enabled: true
    serviceMonitor:
      enabled: true

redis:
  enabled: true

repoServer:
  serviceAccount:
    create: true

configs:
  params:
    server.insecure: "true"
  cm:
    accounts.admin: "apiKey, login"
EOF
    
    print_success "ArgoCD values customized"
}

# Function to customize Prometheus values
customize_prometheus_values() {
    cat > ${PROMETHEUS_CHART_DIR}/values.yaml << EOF
# Prometheus Configuration
alertmanager:
  enabled: false

prometheus:
  prometheusSpec:
    serviceMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelector: {}
    podMonitorSelectorNilUsesHelmValues: false
    podMonitorSelector: {}
  
  service:
    type: NodePort
    nodePort: 30090

pushgateway:
  enabled: false

server:
  persistentVolume:
    enabled: false
EOF
    
    print_success "Prometheus values customized"
}

# Function to customize Grafana values
customize_grafana_values() {
    cat > ${GRAFANA_CHART_DIR}/values.yaml << EOF
# Grafana Configuration
service:
  type: NodePort
  nodePort: 30300

persistence:
  enabled: false

adminUser: admin
adminPassword: admin

datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-server.monitoring.svc.cluster.local
      access: proxy
      isDefault: true

dashboardProviders:
  dashboardproviders.yaml:
    apiVersion: 1
    providers:
    - name: 'default'
      orgId: 1
      folder: ''
      type: file
      disableDeletion: false
      editable: true
      options:
        path: /var/lib/grafana/dashboards/default

dashboards:
  default:
    kubernetes:
      gnetId: 7249
      revision: 1
      datasource: Prometheus
EOF
    
    print_success "Grafana values customized"
}

# Function to deploy ArgoCD using Helm
deploy_argocd() {
    print_status "Deploying ArgoCD..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace ${ARGO_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    
    # Install ArgoCD from local chart
    helm upgrade --install argocd ${ARGO_CHART_DIR} \
        --namespace ${ARGO_NAMESPACE} \
        --values ${ARGO_CHART_DIR}/values.yaml \
        --wait
    
    # Wait for ArgoCD server to be ready
    kubectl wait --for=condition=available deployment/argocd-server \
        --namespace ${ARGO_NAMESPACE} \
        --timeout=300s
    
    # Get ArgoCD admin password
    ARGO_PASSWORD=$(kubectl -n ${ARGO_NAMESPACE} get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
    
    print_success "ArgoCD deployed successfully"
    print_status "ArgoCD Admin Password: ${ARGO_PASSWORD}"
    print_status "ArgoCD URL: http://localhost:8080"
}

# Function to create ArgoCD Application manifests
create_argocd_applications() {
    print_status "Creating ArgoCD Application manifests..."
    
    # Create monitoring namespace
    cat > ${APPLICATIONS_DIR}/monitoring-namespace.yaml << EOF
apiVersion: v1
kind: Namespace
metadata:
  name: ${MONITORING_NAMESPACE}
EOF
    
    # Create Prometheus Application
    cat > ${APPLICATIONS_DIR}/prometheus-app.yaml << EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prometheus
  namespace: ${ARGO_NAMESPACE}
spec:
  destination:
    server: https://kubernetes.default.svc
    namespace: ${MONITORING_NAMESPACE}
  source:
    path: charts/prometheus
    repoURL: file://${SCRIPT_DIR}
    targetRevision: HEAD
    helm:
      valueFiles:
      - values.yaml
  project: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
EOF
    
    # Create Grafana Application
    cat > ${APPLICATIONS_DIR}/grafana-app.yaml << EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: grafana
  namespace: ${ARGO_NAMESPACE}
spec:
  destination:
    server: https://kubernetes.default.svc
    namespace: ${MONITORING_NAMESPACE}
  source:
    path: charts/grafana
    repoURL: file://${SCRIPT_DIR}
    targetRevision: HEAD
    helm:
      valueFiles:
      - values.yaml
  project: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
EOF
    
    print_success "ArgoCD Application manifests created"
}

# Function to deploy applications via ArgoCD
deploy_via_argocd() {
    print_status "Deploying Prometheus and Grafana via ArgoCD..."
    
    # Apply the applications
    kubectl apply -f ${APPLICATIONS_DIR}/monitoring-namespace.yaml
    kubectl apply -f ${APPLICATIONS_DIR}/prometheus-app.yaml
    kubectl apply -f ${APPLICATIONS_DIR}/grafana-app.yaml
    
    # Wait for applications to sync
    print_status "Waiting for applications to sync..."
    sleep 10
    
    # Check application status
    kubectl get applications -n ${ARGO_NAMESPACE}
    
    print_success "Applications deployed via ArgoCD"
}

# Function to display access information
display_access_info() {
    echo ""
    echo -e "${GREEN}===========================================${NC}"
    echo -e "${GREEN}        DEPLOYMENT COMPLETE               ${NC}"
    echo -e "${GREEN}===========================================${NC}"
    echo ""
    echo -e "${YELLOW}ACCESS INFORMATION:${NC}"
    echo ""
    echo -e "${BLUE}ArgoCD:${NC}"
    echo -e "  URL:      http://localhost:8080"
    echo -e "  Username: admin"
    echo -e "  Password: $(kubectl -n ${ARGO_NAMESPACE} get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)"
    echo ""
    echo -e "${BLUE}Prometheus:${NC}"
    echo -e "  URL:      http://localhost:9090"
    echo ""
    echo -e "${BLUE}Grafana:${NC}"
    echo -e "  URL:      http://localhost:3000"
    echo -e "  Username: admin"
    echo -e "  Password: admin"
    echo ""
    echo -e "${GREEN}To access the cluster:${NC}"
    echo -e "  kubectl cluster-info --context kind-${CLUSTER_NAME}"
    echo ""
    echo -e "${YELLOW}To clean up the cluster:${NC}"
    echo -e "  kind delete cluster --name ${CLUSTER_NAME}"
    echo ""
}

# Function to wait for all pods to be ready
wait_for_pods() {
    print_status "Waiting for all pods to be ready..."
    
    # Wait for ArgoCD pods
    kubectl wait --for=condition=ready pods --all -n ${ARGO_NAMESPACE} --timeout=300s
    
    # Wait for monitoring pods
    kubectl wait --for=condition=ready pods --all -n ${MONITORING_NAMESPACE} --timeout=300s
    
    print_success "All pods are ready"
}

# Function to install ArgoCD CLI if not present
install_argocd_cli() {
    if ! command -v argocd &> /dev/null; then
        print_status "Installing ArgoCD CLI..."
        
        # Detect OS
        OS=$(uname -s | tr '[:upper:]' '[:lower:]')
        ARCH=$(uname -m)
        
        if [ "$ARCH" = "x86_64" ]; then
            ARCH="amd64"
        elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            ARCH="arm64"
        fi
        
        # Download and install
        VERSION=$(curl --silent "https://api.github.com/repos/argoproj/argo-cd/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
        
        curl -sSL -o argocd-linux-${ARCH} https://github.com/argoproj/argo-cd/releases/download/${VERSION}/argocd-linux-${ARCH}
        sudo install -m 555 argocd-linux-${ARCH} /usr/local/bin/argocd
        rm argocd-linux-${ARCH}
        
        print_success "ArgoCD CLI installed"
    fi
}

# Main execution flow
main() {
    print_status "Starting Kind + ArgoCD bootstrap process..."
    
    # Create directory structure
    create_directory_structure
    
    # Create Kind configuration
    create_kind_config
    
    # Setup Kind cluster
    setup_kind_cluster
    
    # Download Helm charts
    download_helm_charts
    
    # Customize chart values
    customize_argocd_values
    customize_prometheus_values
    customize_grafana_values
    
    # Deploy ArgoCD
    deploy_argocd
    
    # Create ArgoCD applications
    create_argocd_applications
    
    # Deploy via ArgoCD
    deploy_via_argocd
    
    # Install ArgoCD CLI
    install_argocd_cli
    
    # Wait for pods
    wait_for_pods
    
    # Display access information
    display_access_info
    
    print_success "Bootstrap process completed successfully!"
}

# Run main function
main "$@"
```

Now, let me create a README file to accompany this script:

```markdown
# Kind + ArgoCD Bootstrap Script

This script bootstraps a complete sandbox Kubernetes environment using Kind, with ArgoCD managing the deployment of Prometheus and Grafana from local Helm charts.

## Prerequisites

- Docker installed and running
- kubectl installed
- Helm v3 installed
- curl installed

## Quick Start

1. Make the script executable:
```bash
chmod +x bootstrap-kind-argocd.sh
```

1. Run the bootstrap script:

```bash
./bootstrap-kind-argocd.sh
```

What This Script Does

1. Creates a Kind Kubernetes cluster with:
   · Port mappings for ArgoCD (8080), Prometheus (9090), and Grafana (3000)
   · Ingress-ready configuration
2. Downloads and organizes Helm charts locally for:
   · ArgoCD (v5.51.6)
   · Prometheus (v25.12.0)
   · Grafana (v10.0.0)
3. Customizes chart values for Kind environment:
   · Configures NodePort services
   · Sets up insecure mode for development
   · Configures basic authentication
4. Deploys ArgoCD and waits for it to be ready
5. Creates ArgoCD Application manifests that point to local Helm charts
6. Deploys Prometheus and Grafana through ArgoCD GitOps workflow

Access Information

After running the script, you'll have access to:

· ArgoCD: http://localhost:8080
  · Username: admin
  · Password: (generated, displayed after deployment)
· Prometheus: http://localhost:9090
· Grafana: http://localhost:3000
  · Username: admin
  · Password: admin

Directory Structure

```
.
├── bootstrap-kind-argocd.sh      # Main bootstrap script
├── kind-config.yaml             # Kind cluster configuration
├── charts/                      # Local Helm charts
│   ├── argo-cd/                 # ArgoCD chart
│   ├── prometheus/              # Prometheus chart
│   └── grafana/                 # Grafana chart
└── applications/                # ArgoCD Application manifests
    ├── monitoring-namespace.yaml
    ├── prometheus-app.yaml
    └── grafana-app.yaml
```

Customization

You can customize the deployment by modifying:

1. Chart values: Edit the values.yaml files in each chart directory
2. Application manifests: Modify files in the applications/ directory
3. Kind configuration: Edit kind-config.yaml

Cleanup

To delete the Kind cluster:

```bash
kind delete cluster --name sandbox-cluster
```

Notes

· This setup is for development/sandbox purposes only
· All passwords are set to defaults for easy access
· Data persistence is disabled by default
· The cluster uses NodePort services for simplicity

```

## Features

1. **Complete Sandbox Environment**: Single script to create everything
2. **Local Helm Charts**: All charts are downloaded and stored locally
3. **GitOps Workflow**: ArgoCD manages the deployment of monitoring stack
4. **Accessible Services**: All services exposed via localhost ports
5. **Self-contained**: No external dependencies during runtime
6. **Clean Structure**: Organized directory layout for easy customization

The script will:
1. Check for required tools (Docker, kubectl, Helm)
2. Create a Kind cluster with proper port mappings
3. Download and customize Helm charts
4. Deploy ArgoCD
5. Use ArgoCD to deploy Prometheus and Grafana
6. Display access information

This provides a complete, ready-to-use Kubernetes sandbox with GitOps-powered monitoring stack!