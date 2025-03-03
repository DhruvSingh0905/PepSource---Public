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
  key_terms: string;
  order_num: number | null;
}

interface ArticlesSectionProps {
  drugId: number;
}

function ArticlesSection({ drugId }: ArticlesSectionProps) {
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
          // Sort articles by order_num (ranking), with nulls at the end
          const sortedArticles = data.articles.sort((a: Article, b: Article) => {
            // If both have order_num, sort by order_num
            if (a.order_num !== null && b.order_num !== null) {
              return a.order_num - b.order_num;
            }
            // If only a has order_num, a comes first
            if (a.order_num !== null) return -1;
            // If only b has order_num, b comes first
            if (b.order_num !== null) return 1;
            // If neither has order_num, maintain original order
            return 0;
          });
          
          // Limit to the top 5 articles
          setArticles(sortedArticles.slice(0, 5));
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

  if (loading) return <p className="text-center">Loading articles...</p>;
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center">No articles at this time.</p>;

  return (
    <div className="articles-section mt-12">
      <h2 className="text-3xl font-bold mb-4">Research Articles</h2>
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
              <summary className="cursor-pointer font-semibold">Background</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.background}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Methods</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.methods}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Results</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.results}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Conclusions</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.conclusions}</div>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

export default ArticlesSection;