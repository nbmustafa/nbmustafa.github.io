![Author Nashwan](https://img.shields.io/badge/Author-Nashwan%20Mustafa-orange.svg?style=flat-square)

# Cost-Optimization with Shared VPC endpoints in a Multi-Account TGW setup
## About the Solution

The cost of VPC endpoints depends on multiple factors like the number of endpoints. Although Interface Endpoints scale more cleanly as the number of services increases, they introduce another scaling problem that makes the previous approach of deploying per-VPC impracticable: 

Each Endpoint costs 1 cent per AZ per hour. For example if you were to deploy Interface Endpoints for all of the supported services (currently over 50) across 3 AZs in say 20 VPCs, the cost would be $(0.01 x 50 x 3 x 20) = $30/hr or over $20,000/month! <br />

`Formula: #VPC Endpoints x #AZs x 24hrs x 30 days x .01(Pricing per VPC endpoint per AZ ($/hour))` <br />
If we have 10 vpc endpoints, in 3 AZs, the cost is going to be as below:<br />
`[10 x 3 x 24 x 30 x .01] = ~$216/month*` <br />
For big organisations where they have 100 accounts and each housing around 10 endpoints that will be outrageous `(~$21,600/month* or $259k/yr*)`. <br />

### **How This Achieves Cost Savings**

1. **Elimination of Redundant Endpoints**:
   - Without centralization, each of the 1,000 accounts might deploy 10 VPC Interface Endpoints (e.g., for S3, EC2, SQS, etc.), each costing ~$0.01 per AZ per hour in us-east-1. For 3 AZs, that’s ~$27/month per endpoint per account.
   - Total cost for 1,000 accounts: `1,000 accounts × 10 endpoints × $27 = $270,000/month`.
   - With the shared model, only one set of endpoints is deployed in the Shared Services VPC (e.g., 10 endpoints × 3 AZs = $270/month), reducing costs to ~0.1% of the decentralized approach.

2. **Reduced Data Transfer Costs**:
   - VPC Endpoints keep traffic within the AWS backbone, avoiding NAT Gateway or Internet Gateway data transfer costs ($0.045/GB in us-east-1).[](https://aws.amazon.com/vpc/pricing/)
   - Gateway Endpoints (for S3 and DynamoDB) are free, further reducing costs if used.[](https://pcg.io/insights/vpc-endpoints-explanation-and-cost-comparison/)

3. **Centralized Management**:
   - Centralizing endpoints reduces administrative overhead, as only the Shared Services Account team manages endpoint configurations, updates, and policies.

4. **Transit Gateway Efficiency**:
   - A single Transit Gateway connects all VPCs, avoiding the need for multiple VPC peering connections, which can become complex and costly at scale (e.g., VPC peering has per-connection costs).[](https://medium.com/%40KiranNalla3/aws-cost-savings-by-using-shared-vpc-interface-endpoints-in-a-multi-account-tgw-setup-f58b8ed90c72)

5. **Route 53 PHZ Cost**:
   - A single PHZ (~$0.50/month) is shared across accounts via RAM, avoiding the need for each account to manage its own DNS resolution.[](https://dev.to/aws-builders/vpc-interface-endpoints-sharing-in-a-multi-account-organization-4nbj)

**Estimated Savings Example**:
- **Decentralized**: $270,000/month for 1,000 accounts with 10 endpoints each.
- **Centralized**: $270/month (endpoints) + ~$100/month (Transit Gateway, assuming minimal attachments) + $0.50/month (PHZ) ≈ $370.50/month.
- **Savings**: ~$269,629.50/month (99.86% reduction).

#### Cost Savings Analysis
The shared VPC endpoint model achieves significant cost savings by centralizing endpoints, reducing redundancy, and optimizing network usage. Below is a detailed breakdown:

| **Aspect**               | **Decentralized Model (Per Account)** | **Shared Model (Centralized)** | **Savings**                     |
|--------------------------|---------------------------------------|--------------------------------|-------------------------------|
| Number of Accounts       | 1,000                                | 1 (Shared Services Account)    | -                             |
| Endpoints per Account    | 10 (e.g., S3, EC2, SQS)              | 10 (centralized)               | -                             |
| Cost per Endpoint (3 AZs)| ~$27/month                           | ~$27/month                     | -                             |
| Total Endpoint Cost      | 1,000 × 10 × $27 = $270,000/month    | 10 × $27 = $270/month          | $269,730/month (99.9% reduction) |
| Data Transfer Costs      | Potential NAT Gateway/Internet costs | None (within AWS network)      | Significant savings           |
| Management Overhead      | High (1,000 accounts)                | Low (centralized)              | Reduced administrative costs  |

- **Centralized Endpoints**: By deploying endpoints once in the Shared VPC, we avoid the cost of 10,000 endpoints (1,000 accounts × 10 endpoints), reducing monthly costs from $270,000 to $270, a 99.9% reduction.
- **No Data Transfer Costs**: Traffic via VPC endpoints stays within the AWS network backbone, avoiding charges for NAT Gateways or Internet Gateways ($0.045/GB in us-east-1).
- **Gateway Endpoints**: Free for S3 and DynamoDB, further reducing costs compared to using Interface Endpoints for these services in a decentralized model.
- **Simplified Management**: Centralizing endpoints reduces administrative overhead, as only the Shared Services Account manages configurations, updates, and policies.

Now the good news is there is a way to avoid paying that outrageous bill with using shared service VPC over TGW. 

# what resources will be created with this solution:
- From the the account that has the shared VPC we run terraform code which will create the following resources:
**Note** We assume VPCs including Shared VPC and TGW are already existing. 
    1. Create the interface VPC endpoint in Shared Services VPC
    2. Turn off the private DNS when you create the endpoint.
    3. Create a Private Hosted zone with the same name as your endpoint (ex: ec2.amazonaws.com). This will give you full control over PHZ

- Now we need to
    1. Associate your Private Hosted Zone(PHZ) with your other account(s), This way you will be able to resolve to the private IPs of the VPC endpoints
    2. Make sure you have correct routing through Subnets and security groups



# Integrating AWS Transit Gateway with AWS PrivateLink and Amazon Route 53 Resolver
 This solution is bart of Best Practices for AWS PrivateLink. It uses AWS Transit Gateway, along with Amazon Route 53 hosted zone, and vpc endpoints in a so called shared-service-vpc to share AWS PrivateLink interface endpoints between multiple connected (VPCs) and an on-premises environment. This solution can greatly reduce the number of VPC endpoints, simplify VPC endpoint deployment, which mean less operation and maintenance overhead and most importatantly help cost-optimize when deploying at scale.

Architecture overview
For VPC endpoints that you use to connect to endpoint services (services you create using AWS PrivateLink behind a Network Load Balancer) the architecture is fairly straightforward. Since the DNS entries for the VPC endpoint are public, you just need layer-three connectivity between a VPC and its destination using either VPC peering, transit gateway, or a VPN. Where the architecture becomes more complex is when you want to share endpoints for AWS services and AWS PrivateLink SaaS.

When you create a VPC endpoint to an AWS service or AWS PrivateLink SaaS, you can enable Private DNS. When enabled, the setting creates an AWS managed Route 53 private hosted zone (PHZ) for you. The managed PHZ works great for resolving the DNS name within a VPC however, it does not work outside of the VPC. This is where PHZ sharing and Route 53 Resolver come into play to help us get unified name resolution for shared VPC endpoints. We’ll now dig into how you can make this name resolution work from VPC to VPC and from on-premises.

Custom PHZ
In both the VPC-to-VPC and on-premises scenarios our first step is to disable private DNS on the VPC endpoint. From the VPC console, we’ll choose Endpoints and select the endpoint. For Enable Private DNS Name, we’ll clear the check box.

https://aws.amazon.com/blogs/networking-and-content-delivery/integrating-aws-transit-gateway-with-aws-privatelink-and-amazon-route-53-resolver/


Below is the solution architecture that we are going to implement it using Terraform and shell script
<img width="50%" align="centre" alt="Github" src="./contents/articles/images/vpc-endpoint.png" />


# How do I associate a Route 53 private hosted zone with a VPC in a different AWS account or Region?

- To associate a Route 53 private hosted zone in one AWS account **(Account A)** with a VPC that belongs to another AWS account **(Account B)** or Region, follow these steps using the AWS CLI. <br />

    1. Make sure your AWS cli profile is set to run commands against **Account A**. <br />

    2. Run the following command to list the available hosted zones in **Account A**. Note the hosted zone ID in **Account A** that you'll associate with **Account B**. <br />
    `aws route53 list-hosted-zones` <br />

    3. Run the following command to authorize the association between the private hosted zone in **Account A** and the VPC in **Account B**. Use the hosted zone ID from the previous step. Use the Region and ID of the VPC in **Account B**. <br />
    **Note**: Include "--region" if you are inside any EC2 instance of a different Region or using user's credentials with different Region other than "ap-southeast-2" <br />
    `aws route53 create-vpc-association-authorization --hosted-zone-id <hosted-zone-id> --vpc VPCRegion=<region>,VPCId=<vpc-id> --region ap-southeast-2` <br />

    4. Now switch your AWS cli profile  to run commands against **Account B**. <br />

    5.  Run the following command to create the association between the private hosted zone in **Account A** and the VPC in **Account B**. Use the hosted zone ID from step 3. Use the Region and ID of the VPC in **Account B**.<br />
    **Note**: Be sure to use an IAM user or role that has permission to run Route 53 APIs in **Account B**.<br />
    `aws route53 associate-vpc-with-hosted-zone --hosted-zone-id <hosted-zone-id> --vpc VPCRegion=<region>,VPCId=<vpc-id> --region ap-southeast-2` <br />

    6. It's a best practice to delete the association authorization after the association is created. This step prevents you from recreating the same association later. To delete the authorization, reconnect to **Account A**. Then, run the following command: <br />
    `aws route53 delete-vpc-association-authorization --hosted-zone-id <hosted-zone-id>  --vpc VPCRegion=<region>,VPCId=<vpc-id> --region us-east-1` <br />


### **Sources**
-: Centralized VPC endpoint model for cost savings.[](https://allcloud.io/go/reduce-costs-and-boost-security-with-centralized-vpc-shared-endpoints-model/)
-: Shared VPC endpoints with Transit Gateway for cost optimization.[](https://medium.com/%40KiranNalla3/aws-cost-savings-by-using-shared-vpc-interface-endpoints-in-a-multi-account-tgw-setup-f58b8ed90c72)
-: Centralized access to VPC private endpoints.[](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-vpc-private-endpoints.html)
-: Cost comparison of VPC Endpoints vs. NAT Gateways.[](https://pcg.io/insights/vpc-endpoints-explanation-and-cost-comparison/)
-: Benefits of VPC Endpoints for cost and security.[](https://aws.amazon.com/blogs/architecture/reduce-cost-and-increase-security-with-amazon-vpc-endpoints/)

This architecture achieves significant cost savings, simplifies management, and maintains security for an organization with 1,000 AWS accounts. Let me know if you need further details or assistance with implementation!