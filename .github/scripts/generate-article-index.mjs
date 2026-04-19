import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = process.cwd();
const articlesRoot = path.join(repoRoot, 'contents', 'articles');
const outputFile = path.join(articlesRoot, 'index.json');

const topicMap = {
    ai: 'AI',
    aws: 'AWS',
    'aws-security': 'AWS Security',
    certification: 'Certification',
    'cloud-architecture': 'Cloud Architecture',
    'exams-prep': 'Exams Prep',
    kubernetes: 'Kubernetes',
    'kubernetes-networking': 'Kubernetes Networking',
    observability: 'Observability',
};

const featuredFiles = new Set([
    'ai/kubernetes-cost-optimizer.md',
    'aws-security/eso-managing-cross-account-secrets.md',
    'kubernetes/kubernetes-sandbox.md',
]);

function walkMarkdownFiles(dirPath) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (entry.name === 'images') {
            continue;
        }

        const absolutePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkMarkdownFiles(absolutePath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(absolutePath);
        }
    }

    return files;
}

function titleCaseSegment(segment) {
    if (!segment) {
        return '';
    }

    if (/[A-Z]{2,}/.test(segment) || /^[A-Z0-9]+$/.test(segment)) {
        return segment;
    }

    const knownTerms = {
        ai: 'AI',
        api: 'API',
        argocd: 'ArgoCD',
        aws: 'AWS',
        ci: 'CI',
        ckad: 'CKAD',
        ecr: 'ECR',
        eks: 'EKS',
        finops: 'FinOps',
        gitops: 'GitOps',
        helm: 'Helm',
        istio: 'Istio',
        k8s: 'K8s',
        kubernetes: 'Kubernetes',
        mlops: 'MLOps',
        nlb: 'NLB',
        oomkilled: 'OOMKilled',
        rag: 'RAG',
        s3: 'S3',
        sse: 'SSE',
        terraform: 'Terraform',
        ui: 'UI',
        vpcendpoint: 'VPCEndpoint',
    };

    const lowerSegment = segment.toLowerCase();
    if (knownTerms[lowerSegment]) {
        return knownTerms[lowerSegment];
    }

    return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
}

function titleFromRelativePath(relativePath) {
    const fileName = path.basename(relativePath, '.md');
    return fileName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(titleCaseSegment)
        .join(' ');
}

function summaryFromMarkdown(markdown) {
    const lines = markdown.split('\n');
    const paragraphLines = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            if (paragraphLines.length > 0) {
                break;
            }
            continue;
        }

        if (
            line.startsWith('#') ||
            line.startsWith('![') ||
            line.startsWith('<img') ||
            line.startsWith('```') ||
            line.startsWith('---') ||
            line.startsWith('|') ||
            line.startsWith('>') ||
            line.startsWith('- ') ||
            line.startsWith('* ') ||
            /^\d+\.\s/.test(line)
        ) {
            if (paragraphLines.length > 0) {
                break;
            }
            continue;
        }

        paragraphLines.push(line);
    }

    const summary = paragraphLines
        .join(' ')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/[`*_>#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!summary) {
        return 'Read the full article for practical notes, patterns, and implementation details.';
    }

    return summary.length > 220 ? `${summary.slice(0, 217).trimEnd()}...` : summary;
}

function createdDateForFile(relativePath) {
    try {
        const output = execFileSync(
            'git',
            ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', path.join('contents', 'articles', relativePath)],
            { cwd: repoRoot, encoding: 'utf8' }
        ).trim();

        if (output) {
            const lines = output.split('\n').filter(Boolean);
            const oldest = lines[lines.length - 1];
            if (oldest) {
                return oldest.slice(0, 10);
            }
        }
    } catch (error) {
        // Fall through to filesystem metadata.
    }

    const stats = fs.statSync(path.join(articlesRoot, relativePath));
    const fallbackDate = stats.birthtime instanceof Date && !Number.isNaN(stats.birthtime.getTime())
        ? stats.birthtime
        : stats.mtime;

    return fallbackDate.toISOString().slice(0, 10);
}

function buildArticle(relativePath) {
    const [folderName] = relativePath.split(path.sep);
    const topic = topicMap[folderName];
    if (!topic) {
        return null;
    }

    const markdown = fs.readFileSync(path.join(articlesRoot, relativePath), 'utf8');
    const normalizedPath = relativePath.split(path.sep).join('/');

    return {
        file: normalizedPath,
        title: titleFromRelativePath(normalizedPath),
        summary: summaryFromMarkdown(markdown),
        topic,
        date: createdDateForFile(normalizedPath),
        featured: featuredFiles.has(normalizedPath),
    };
}

function compareArticles(left, right) {
    if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
    }
    return left.title.localeCompare(right.title);
}

const markdownFiles = walkMarkdownFiles(articlesRoot)
    .map(filePath => path.relative(articlesRoot, filePath))
    .filter(relativePath => relativePath !== 'index.json');

const articles = markdownFiles
    .map(buildArticle)
    .filter(Boolean)
    .sort(compareArticles);

fs.writeFileSync(outputFile, `${JSON.stringify({ articles }, null, 2)}\n`);
