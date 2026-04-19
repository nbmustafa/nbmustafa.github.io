This is a production-grade, organization-wide DNS architecture using Amazon Route 53 Resolver, structured exactly as you would expect from a principal cloud network engineer:

Fully modular Terraform

Central DNS hub VPC

AWS RAM sharing for resolver rules

Query logging

Route 53 Resolver DNS Firewall

AWS-style architecture diagram (Mermaid)



---

1. Org-Wide DNS Architecture Pattern

Pattern: Centralized DNS Hub-and-Spoke

Why this pattern

Single authoritative integration point with on-prem DNS

Scales across hundreds of VPCs / accounts

Centralized security, logging, and policy enforcement

Avoids rule duplication and configuration drift



---

2. High-Level Architecture

┌────────────────────────── AWS Organization ──────────────────────────┐
│                                                                       │
│  ┌──────────────┐        RAM Share        ┌──────────────┐           │
│  │ App Account A│◄───────────────────────│ DNS Hub Acct  │           │
│  └──────────────┘                         │ (Shared Svc) │           │
│                                           └───────┬──────┘           │
│  ┌──────────────┐        RAM Share                 │                 │
│  │ App Account B│◄─────────────────────────────────┘                 │
│  └──────────────┘                                                     │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                                     │
                           Direct Connect / VPN
                                     │
                             ┌───────────────┐
                             │ On-Prem DNS   │
                             └───────────────┘


---

3. Terraform Module Structure

terraform/
├── modules/
│   ├── resolver-endpoints/
│   ├── resolver-rules/
│   ├── dns-firewall/
│   ├── query-logging/
│   └── ram-sharing/
│
├── envs/
│   ├── dns-hub/
│   │   └── main.tf
│   ├── app-account/
│   │   └── main.tf


---

4. Core Modules


---

4.1 resolver-endpoints Module

Purpose

Creates inbound and outbound Route 53 Resolver endpoints.

modules/resolver-endpoints/main.tf

resource "aws_security_group" "this" {
  name   = var.name
  vpc_id = var.vpc_id

  ingress {
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = var.allowed_cidrs
  }

  ingress {
    from_port   = 53
    to_port     = 53
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidrs
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_route53_resolver_endpoint" "inbound" {
  name      = "${var.name}-inbound"
  direction = "INBOUND"

  security_group_ids = [aws_security_group.this.id]

  dynamic "ip_address" {
    for_each = var.subnet_ids
    content {
      subnet_id = ip_address.value
    }
  }
}

resource "aws_route53_resolver_endpoint" "outbound" {
  name      = "${var.name}-outbound"
  direction = "OUTBOUND"

  security_group_ids = [aws_security_group.this.id]

  dynamic "ip_address" {
    for_each = var.subnet_ids
    content {
      subnet_id = ip_address.value
    }
  }
}


---

4.2 resolver-rules Module

Purpose

Conditional forwarding to on-prem DNS.

resource "aws_route53_resolver_rule" "this" {
  domain_name          = var.domain_name
  rule_type            = "FORWARD"
  resolver_endpoint_id = var.outbound_endpoint_id

  dynamic "target_ip" {
    for_each = var.target_ips
    content {
      ip   = target_ip.value
      port = 53
    }
  }
}


---

4.3 ram-sharing Module

Purpose

Share resolver rules org-wide.

resource "aws_ram_resource_share" "this" {
  name                      = var.name
  allow_external_principals = false
}

resource "aws_ram_resource_association" "rule" {
  resource_share_arn = aws_ram_resource_share.this.arn
  resource_arn       = var.resolver_rule_arn
}

resource "aws_ram_principal_association" "org" {
  principal          = var.organization_arn
  resource_share_arn = aws_ram_resource_share.this.arn
}


---

4.4 query-logging Module

Purpose

Central DNS observability.

resource "aws_cloudwatch_log_group" "resolver" {
  name              = "/route53/resolver"
  retention_in_days = 30
}

resource "aws_route53_resolver_query_log_config" "this" {
  name            = "dns-query-logs"
  destination_arn = aws_cloudwatch_log_group.resolver.arn
}

resource "aws_route53_resolver_query_log_config_association" "vpc" {
  resolver_query_log_config_id = aws_route53_resolver_query_log_config.this.id
  resource_id                  = var.vpc_id
}


---

4.5 dns-firewall Module

Purpose

Block malicious or unauthorized domains.

resource "aws_route53_resolver_firewall_domain_list" "blocked" {
  name    = "blocked-domains"
  domains = var.blocked_domains
}

resource "aws_route53_resolver_firewall_rule_group" "this" {
  name = "dns-firewall-group"
}

resource "aws_route53_resolver_firewall_rule" "block" {
  firewall_rule_group_id = aws_route53_resolver_firewall_rule_group.this.id
  firewall_domain_list_id = aws_route53_resolver_firewall_domain_list.blocked.id
  priority = 100
  action   = "BLOCK"
}

resource "aws_route53_resolver_firewall_rule_group_association" "vpc" {
  firewall_rule_group_id = aws_route53_resolver_firewall_rule_group.this.id
  vpc_id                = var.vpc_id
  priority              = 100
}


---

5. DNS Hub Environment Example

module "resolver" {
  source        = "../../modules/resolver-endpoints"
  name          = "dns-hub"
  vpc_id        = var.vpc_id
  subnet_ids    = var.subnet_ids
  allowed_cidrs = var.onprem_cidrs
}

module "onprem_rule" {
  source                = "../../modules/resolver-rules"
  domain_name           = "corp.example.com"
  outbound_endpoint_id  = module.resolver.outbound_id
  target_ips            = var.onprem_dns_ips
}


---

6. AWS-Style Architecture Diagram (Mermaid)

You can paste this directly into draw.io → Arrange → Insert → Advanced → Mermaid.

flowchart LR
    OnPremDNS[On-Prem DNS Servers]

    subgraph AWS_Org[AWS Organization]
        subgraph DNS_Hub[DNS Hub Account]
            Inbound[Inbound Resolver Endpoint]
            Outbound[Outbound Resolver Endpoint]
            Firewall[DNS Firewall]
            Logs[Query Logging]
        end

        subgraph AppVPC1[Application VPCs]
            EC2[Workloads]
        end
    end

    EC2 -->|DNS Query| Firewall
    Firewall --> Outbound
    Outbound --> OnPremDNS
    OnPremDNS --> Inbound
    Inbound --> EC2
    Firewall --> Logs


---

7. Operational Recommendations

Treat DNS hub as Tier-0 infrastructure

Use separate AWS account

Enforce rule creation via CI/CD only

Log and alarm on NXDOMAIN spikes

Periodically audit RAM shares

Add AWS Managed Domain Lists for threat intel



---