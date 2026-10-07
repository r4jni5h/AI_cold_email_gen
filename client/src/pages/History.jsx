import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { TrashIcon } from '@heroicons/react/24/outline';
import api from '../utils/api';
import ResultCard from '../components/ResultCard';

const History = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/ai/history')
            .then(({ data }) => { if (!cancelled) setItems(data); })
            .catch((error) => {
                if (!cancelled) toast.error(error.response?.data?.message || 'Failed to load history');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this generation?')) return;
        try {
            await api.delete(`/ai/history/${id}`);
            setItems((prev) => prev.filter((i) => i._id !== id));
            toast.success('Deleted');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete');
        }
    };

    if (loading) return <div className="text-gray-500">Loading history...</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">History</h2>
            {items.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-400">
                    Nothing here yet. Generate your first email from the Dashboard.
                </div>
            ) : (
                <ul className="space-y-3">
                    {items.map((item) => (
                        <li key={item._id} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                            <div className="flex items-start justify-between p-4 gap-4">
                                <button
                                    onClick={() => setOpenId(openId === item._id ? null : item._id)}
                                    className="text-left flex-1 min-w-0"
                                >
                                    <p className="font-medium text-gray-800 truncate">{item.subject}</p>
                                    <p className="text-xs text-gray-500 truncate mt-1">{item.prompt}</p>
                                    <p className="text-xs text-gray-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                                </button>
                                <button
                                    onClick={() => handleDelete(item._id)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    aria-label="Delete"
                                    title="Delete"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                            {openId === item._id && (
                                <div className="px-4 pb-2 border-t border-gray-100 pt-4">
                                    <ResultCard title="Subject Line" content={item.subject} />
                                    <ResultCard title="Cold Email" content={item.emailBody} />
                                    <ResultCard title="LinkedIn DM" content={item.linkedInDM} />
                                    <ResultCard title="Follow-up Email" content={item.followUpEmail} />
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default History;
