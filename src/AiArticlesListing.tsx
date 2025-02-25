import { useState, useEffect } from 'react';

interface Article {
  id: number;
  article_url: string;
  pmid: string;
  doi: string;
  title: string;
  background: string;
  methods: string;
  results: string;
  conclusions: string;
  sponsor: string;
  publication_date: string;
  drug_id: number;
  publication_type: string;
  ai_heading: string;
  ai_background: string;
  ai_conclusion: string;
  key_terms: string;
}

interface AiArticlesSectionProps {
  drugId: number;
}

function AiArticlesSection({ drugId }: AiArticlesSectionProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchArticles() {
      try {
        console.log("Fetching articles for drugId:", drugId);
        const response = await fetch(`http://127.0.0.1:8000/api/articles?drug_id=${drugId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Articles API response:", data);
        if (data.status === "success") {
          setArticles(data.articles);
        } else {
          setError(data.message || "Error fetching articles");
        }
      } catch (err) {
        console.error("Error fetching articles:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, [drugId]);

  if (loading) return <p className="text-center">Loading AI articles...</p>;
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center">No articles at this time.</p>;

  return (
    <div className="ai-articles-section mt-12">
      <h2 className="text-3xl font-bold mb-4">AI-Generated Articles</h2>
      {articles.map((article) => (
        <details key={article.id} className="border p-4 mb-4 rounded">
          <summary className="font-semibold cursor-pointer">
            {article.title} — {article.publication_type} — {article.publication_date} — PMID: {article.pmid}
          </summary>
          <div className="ml-4 mt-2">
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Key Terms</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.key_terms}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">AI Heading</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_heading}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">AI Background</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_background}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">AI Conclusion</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_conclusion}</div>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

export default AiArticlesSection;