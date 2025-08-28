### AWS Secrets Manager with Kubernetes Secrets Store CSI Driver

![Author Nashwan](https://img.shields.io/badge/Author-Nashwan%20Mustafa-orange.svg?style=flat-square)

### Overview
The **AWS Secrets and Configuration Provider (ASCP)** for the Kubernetes Secrets Store CSI Driver allows you to securely mount secrets stored in AWS Secrets Manager as files in your Amazon EKS pods. This integration ensures that secrets are encrypted at rest and in transit, and supports automatic rotation.

### Steps to Implement

1. **Set Up Access Control**:
   - **Create an IAM Policy**: Grant permissions to access the secrets. For example:
     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Action": [
             "secretsmanager:GetSecretValue",
             "secretsmanager:DescribeSecret"
           ],
           "Resource": ["arn:aws:secretsmanager:region:account-id:secret:MySecret-??????"]
         }
       ]
     }
     ```
   - **Create an IAM Role**: Associate this policy with an IAM role and link it to your EKS service account using IAM OIDC provider.

2. **Install the Secrets Store CSI Driver and ASCP**:
   - **Install the CSI Driver**:
     ```sh
     helm repo add secrets-store-csi-driver https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts
     helm install -n kube-system csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver
     ```
   - **Install the ASCP**:
     ```sh
     helm repo add aws-secrets-manager https://aws.github.io/secrets-store-csi-driver-provider-aws
     helm install -n kube-system secrets-provider-aws aws-secrets-manager/secrets-store-csi-driver-provider-aws
     ```

3. **Create a SecretProviderClass**:
   - Define which secrets to mount and how they should appear in the pod. Example YAML:
     ```yaml
     apiVersion: secrets-store.csi.x-k8s.io/v1
     kind: SecretProviderClass
     metadata:
       name: aws-secrets
     spec:
       provider: aws
       parameters:
         objects: |
           - objectName: "arn:aws:secretsmanager:region:account-id:secret:MySecret"
             objectType: "secretsmanager"
     ```

4. **Deploy Your Application**:
   - Create a deployment that references the SecretProviderClass. Example YAML:
     ```yaml
     apiVersion: apps/v1
     kind: Deployment
     metadata:
       name: my-app
     spec:
       replicas: 1
       selector:
         matchLabels:
           app: my-app
       template:
         metadata:
           labels:
             app: my-app
         spec:
           serviceAccountName: my-service-account
           containers:
           - name: my-app
             image: my-app-image
             volumeMounts:
             - name: secrets-store
               mountPath: "/mnt/secrets-store"
               readOnly: true
           volumes:
           - name: secrets-store
             csi:
               driver: secrets-store.csi.k8s.io
               readOnly: true
               volumeAttributes:
                 secretProviderClass: "aws-secrets"
     ```

### Key Features
- **Automatic Rotation**: If you enable automatic rotation in AWS Secrets Manager, the Secrets Store CSI Driver can automatically update the mounted secrets in your pods.
- **Fine-Grained Access Control**: By using IAM roles and policies, you can control which pods have access to specific secrets.
- **Failover Regions**: You can specify a secondary AWS region to retrieve secrets in case of connectivity issues or disaster recovery scenarios¹².

This setup ensures that your secrets are managed securely and efficiently within your EKS environment. If you have any specific questions or need further details, feel free to ask!

¹: [AWS Secrets Manager with Kubernetes Secrets Store CSI Driver](https://docs.aws.amazon.com/secretsmanager/latest/userguide/integrating_csi_driver.html)
²: [GitHub - aws/secrets-store-csi-driver-provider-aws](https://github.com/aws/secrets-store-csi-driver-provider-aws)

Source:
(1) Use AWS Secrets Manager secrets in Amazon Elastic Kubernetes Service. https://docs.aws.amazon.com/secretsmanager/latest/userguide/integrating_csi_driver.html.
(2) GitHub - aws/secrets-store-csi-driver-provider-aws: The AWS provider .... https://github.com/aws/secrets-store-csi-driver-provider-aws.
(3) Accessing AWS Secret Manager in Kubernetes Service Cluster - Xebia. https://xebia.com/blog/how-to-access-your-aws-secret-manager-secrets-in-an-elastic-kubernetes-service-cluster/.
(4) Secrets Store - Amazon EKS Blueprints Quick Start - GitHub Pages. https://aws-quickstart.github.io/cdk-eks-blueprints/addons/secrets-store/.
(5) Introduction - Secrets Store CSI Driver. https://secrets-store-csi-driver.sigs.k8s.io/.
(6) undefined. https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts.
(7) undefined. https://aws.github.io/secrets-store-csi-driver-provider-aws.
(8) undefined. https://raw.githubusercontent.com/aws/secrets-store-csi-driver-provider-aws/main/deployment/aws-provider-installer.yaml.
(9) undefined. https://raw.githubusercontent.com/aws/secrets-store-csi-driver-provider-aws/main/examples/ExampleSecretProviderClass.yaml.
(10) undefined. https://raw.githubusercontent.com/aws/secrets-store-csi-driver-provider-aws/main/examples/ExampleDeployment.yaml.
(11) github.com. https://github.com/awsdocs/aws-directory-service-admin-guide/tree/f8a8771bf3bb977bace3c27d97e5780b788e13b9/doc_source%2Fsimple_ad_seamlessly_join_linux_instance.md.
(12) github.com. https://github.com/awsdocs/aws-iot-docs/tree/84f61be9be9347f842d1be1bc2d421bade20c452/developerguide%2Fapache-kafka-rule-action.md.