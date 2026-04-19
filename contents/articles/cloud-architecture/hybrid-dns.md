

Hybrid DNS resolution between AWS and on-premises

Hybrid DNS resolution between AWS and on-premises DNS using Amazon Route 53 Resolver (VPC endpoint resolver). The design assumes enterprise governance, multi-VPC scalability, and infrastructure-as-code using Terraform.


---

1. Architecture Overview

Objectives

Enable AWS workloads to resolve on-premises DNS zones

Enable on-premises workloads to resolve AWS private hosted zones

Centralize DNS using Route 53 Resolver endpoints

Support multi-VPC and multi-account expansion

Avoid DNS recursion loops and maintain deterministic resolution



---

2. High-Level DNS Flow

AWS → On-Prem

1. EC2 / EKS / Lambda queries DNS
2. Query hits VPC AmazonProvidedDNS (169.254.169.253)
3. Route 53 Resolver evaluates forwarding rules
4. Matching domain forwarded via Outbound Resolver Endpoint
5. Query reaches on-prem DNS servers
6. Response flows back through Resolver

On-Prem → AWS

1. On-prem workload queries AWS private zone
2. On-prem DNS conditional forwarder sends query to AWS
3. Query reaches Inbound Resolver Endpoint
4. Resolver answers using Private Hosted Zones
---

3. Reference Architecture Diagram
+--------------------+                     +----------------------+
|  On-Prem Network   |                     |        AWS           |
|                    |                     |                      |
|  +--------------+  |   DNS Queries       |  +----------------+  |
|  |  DNS Server  |----------------------->|  | Inbound        |  |
|  |  (BIND/AD)   |   (Conditional FWD)    |  | Resolver EP    |  |
|  +--------------+  |                     |  +----------------+  |
|        ^            |                     |          |           |
|        |            |                     |   Route 53 Resolver  |
|        |            |                     |          |           |
|        |            |                     |  +----------------+  |
|        |            |   DNS Responses     |  | Outbound       |  |
|        +----------------------------------|  | Resolver EP    |  |
|                    |   (Forward Rules)   |  +----------------+  |
|                    |                     |          |           |
|                    |                     |   AmazonProvidedDNS  |
|                    |                     |          |           |
|                    |                     |  +----------------+  |
|                    |                     |  |  VPC Workloads |  |
+--------------------+                     |  +----------------+  |
                                           +----------------------+


---

4. Core AWS Components

Component	Purpose
Route 53 Resolver Inbound Endpoint	Accept DNS queries from on-prem
Route 53 Resolver Outbound Endpoint	Forward AWS DNS queries to on-prem
Resolver Rules	Conditional forwarding
Private Hosted Zones	AWS internal DNS
Security Groups	UDP/TCP 53 control
RAM (optional)	Share resolver rules across accounts



---

5. Network & Security Considerations

Connectivity: Direct Connect or Site-to-Site VPN
Ports: UDP/TCP 53 allowed both directions
Subnets: Resolver endpoints must be deployed in at least two AZs
No NAT required
Avoid overlapping DNS zones



---

6. Terraform Implementation

6.1 Variables

variable "vpc_id" {}
variable "subnet_ids" {
  type = list(string)
}
variable "onprem_dns_ips" {
  type = list(string)
}
variable "allowed_cidr" {}


---

6.2 Security Group for Resolver Endpoints

resource "aws_security_group" "resolver_sg" {
  name        = "route53-resolver-sg"
  description = "DNS access for Route53 Resolver"
  vpc_id      = var.vpc_id

  ingress {
    protocol    = "udp"
    from_port   = 53
    to_port     = 53
    cidr_blocks = [var.allowed_cidr]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 53
    to_port     = 53
    cidr_blocks = [var.allowed_cidr]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}


---

6.3 Inbound Resolver Endpoint (On-Prem → AWS)

resource "aws_route53_resolver_endpoint" "inbound" {
  name      = "inbound-resolver"
  direction = "INBOUND"

  security_group_ids = [aws_security_group.resolver_sg.id]

  dynamic "ip_address" {
    for_each = var.subnet_ids
    content {
      subnet_id = ip_address.value
    }
  }
}


---

6.4 Outbound Resolver Endpoint (AWS → On-Prem)

resource "aws_route53_resolver_endpoint" "outbound" {
  name      = "outbound-resolver"
  direction = "OUTBOUND"

  security_group_ids = [aws_security_group.resolver_sg.id]

  dynamic "ip_address" {
    for_each = var.subnet_ids
    content {
      subnet_id = ip_address.value
    }
  }
}


---

6.5 Resolver Rule (Conditional Forwarding)

resource "aws_route53_resolver_rule" "onprem_rule" {
  domain_name          = "corp.example.com"
  rule_type            = "FORWARD"
  resolver_endpoint_id = aws_route53_resolver_endpoint.outbound.id

  dynamic "target_ip" {
    for_each = var.onprem_dns_ips
    content {
      ip = target_ip.value
      port = 53
    }
  }
}


---

6.6 Associate Rule with VPC

resource "aws_route53_resolver_rule_association" "vpc_assoc" {
  resolver_rule_id = aws_route53_resolver_rule.onprem_rule.id
  vpc_id           = var.vpc_id
}


---

7. On-Prem DNS Configuration (Example)

BIND Conditional Forwarder

zone "aws.internal" {
  type forward;
  forward only;
  forwarders {
    <Inbound-Resolver-IP-1>;
    <Inbound-Resolver-IP-2>;
  };
};


---

