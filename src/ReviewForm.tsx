import React, { useState } from 'react';
import Rating from 'react-rating';

interface ReviewFormProps {
  targetType: 'drug' | 'vendor';
  targetId: number;
  onReviewSubmitted?: () => void;
}

const ReviewForm: React.FC<ReviewFormProps> = ({ targetType, targetId, onReviewSubmitted }) => {
  const [rating, setRating] = useState<number>(0);
  const [reviewText, setReviewText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Dummy account id for now; replace with actual logged-in user's id
    const payload = {
      account_id: 1,
      target_type: targetType,
      target_id: targetId,
      rating,
      review_text: reviewText,
    };

    fetch("http://127.0.0.1:8000/api/reviews", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          // Optionally, show a success message or clear the form.
          setRating(0);
          setReviewText('');
          if (onReviewSubmitted) {
            onReviewSubmitted();
          }
        } else {
          setError(data.message || "Error submitting review.");
        }
        setSubmitting(false);
      })
      .catch(err => {
        setError(err.toString());
        setSubmitting(false);
      });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded shadow-md">
      <h3 className="text-xl font-semibold mb-2">Write a Review</h3>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
        <Rating
          initialRating={rating}
          onChange={setRating}
          emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
          fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          rows={4}
          placeholder="Type your review here..."
        />
      </div>
      {error && <p className="text-red-500 mb-2">{error}</p>}
      <button
        type="submit"
        disabled={submitting || rating === 0 || reviewText.trim() === ""}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
};

export default ReviewForm;