import { useState, useEffect } from 'react';
import './App.css';

const API = 'http://localhost:5000/api/items';

function App() {
  const [formData, setFormData] = useState({
    itemName: '',
    description: '',
    location: '',
    contact: '',
    email: '',
    type: 'lost',
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [items, setItems] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  // ===== FETCH ALL ITEMS FROM MONGODB =====
  const fetchItems = async () => {
    try {
      const res = await fetch(API);
      const data = await res.json();
      setItems(data);
    } catch (err) {
      console.error('Error fetching items:', err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  };

  // ===== SUBMIT ITEM TO BACKEND =====
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.itemName || !formData.location) return;

    setLoading(true);
    setSubmitMsg('');

    try {
      const form = new FormData();
      form.append('itemName', formData.itemName);
      form.append('description', formData.description);
      form.append('location', formData.location);
      form.append('contact', formData.contact);
      form.append('email', formData.email);
      form.append('type', formData.type);
      if (imageFile) form.append('image', imageFile);

      const res = await fetch(API, {
        method: 'POST',
        body: form,
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitMsg('✅ Item submitted successfully!');
        setFormData({
          itemName: '',
          description: '',
          location: '',
          contact: '',
          email: '',
          type: 'lost',
        });
        setImageFile(null);
        setImagePreview(null);
        document.getElementById('imageInput').value = '';
        fetchItems(); // refresh list from MongoDB
      } else {
        setSubmitMsg('❌ Error submitting item.');
      }
    } catch (err) {
      setSubmitMsg('❌ Cannot connect to backend.');
    }

    setLoading(false);
  };

  // ===== DELETE ITEM FROM MONGODB =====
  const handleDelete = async (id) => {
    try {
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      fetchItems(); // refresh list
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const filtered =
    activeTab === 'all' ? items : items.filter((item) => item.type === activeTab);

  return (
    <div className="app">

      {/* ===== HEADER ===== */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">🔍</span>
            <span className="logo-text">LostFound</span>
          </div>
          <p className="header-sub">Report &amp; Recover Lost Items on Campus</p>
        </div>
      </header>

      <main className="main">

        {/* ===== FORM SECTION ===== */}
        <section className="form-section">
          <div className="section-label">Report an Item</div>

          <form className="form-card" onSubmit={handleSubmit}>

            {/* Lost / Found Toggle */}
            <div className="type-toggle">
              <button
                type="button"
                className={`toggle-btn ${formData.type === 'lost' ? 'active-lost' : ''}`}
                onClick={() => setFormData({ ...formData, type: 'lost' })}
              >
                😢 Lost
              </button>
              <button
                type="button"
                className={`toggle-btn ${formData.type === 'found' ? 'active-found' : ''}`}
                onClick={() => setFormData({ ...formData, type: 'found' })}
              >
                🎉 Found
              </button>
            </div>

            <div className="form-grid">

              {/* Item Name */}
              <div className="input-group">
                <label>Item Name *</label>
                <input
                  name="itemName"
                  value={formData.itemName}
                  onChange={handleChange}
                  placeholder="e.g. Black Wallet"
                  required
                />
              </div>

              {/* Location */}
              <div className="input-group">
                <label>Location *</label>
                <input
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. Library Block B"
                  required
                />
              </div>

              {/* Description */}
              <div className="input-group full-width">
                <label>Description</label>
                <input
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="e.g. Brown leather with ID card inside"
                />
              </div>

              {/* Contact */}
              <div className="input-group">
                <label>Contact Number</label>
                <input
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                  placeholder="e.g. 9876543210"
                />
              </div>

              {/* Email */}
              <div className="input-group">
                <label>Your Email *</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="e.g. you@gmail.com"
                  required
                />
              </div>

              {/* Email Hint */}
              <div className="email-hint full-width">
                <span className="hint-icon">💡</span>
                {formData.type === 'lost'
                  ? 'You will receive an email when someone reports a matching found item.'
                  : 'An email will be sent to the owner if we find a matching lost item.'}
              </div>

              {/* Image Upload */}
              <div className="input-group">
                <label>Upload Image</label>
                <input
                  id="imageInput"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="file-input"
                />
              </div>

              {/* Image Preview */}
              {imagePreview && (
                <div className="image-preview-wrapper full-width">
                  <img src={imagePreview} alt="Preview" className="image-preview" />
                  <button
                    type="button"
                    className="remove-image-btn"
                    onClick={() => {
                      setImagePreview(null);
                      setImageFile(null);
                      document.getElementById('imageInput').value = '';
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
            </div>

            {/* Submit Message */}
            {submitMsg && (
              <div className={`submit-msg ${submitMsg.includes('✅') ? 'msg-success' : 'msg-error'}`}>
                {submitMsg}
              </div>
            )}

            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Submitting...' : '+ Submit Report'}
            </button>
          </form>
        </section>

        {/* ===== ITEMS SECTION ===== */}
        <section className="items-section">
          <div className="items-header">
            <div className="section-label">All Reports</div>

            <div className="tab-bar">
              {['all', 'lost', 'found'].map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? 'tab-active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'all' ? '📋 All' : tab === 'lost' ? '😢 Lost' : '🎉 Found'}
                  <span className="tab-count">
                    {tab === 'all'
                      ? items.length
                      : items.filter((i) => i.type === tab).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No items reported yet.</p>
              <span>Be the first to submit a report above!</span>
            </div>
          ) : (
            <div className="items-grid">
              {filtered.map((item) => (
                <div
                  key={item._id}
                  className={`item-card ${item.type === 'lost' ? 'card-lost' : 'card-found'}`}
                >
                  {/* Image */}
                  {item.image ? (
                    <div className="card-image-wrapper">
                      <img
                        src={`http://localhost:5000${item.image}`}
                        alt={item.itemName}
                        className="card-image"
                      />
                    </div>
                  ) : (
                    <div className="card-image-placeholder">
                      <span>📷</span>
                      <p>No Image</p>
                    </div>
                  )}

                  {/* Card Body */}
                  <div className="card-body">
                    <div className="card-top">
                      <span className={`badge ${item.type === 'lost' ? 'badge-lost' : 'badge-found'}`}>
                        {item.type === 'lost' ? '😢 Lost' : '🎉 Found'}
                      </span>
                      <button
                        className="delete-btn"
                        onClick={() => handleDelete(item._id)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>

                    <h3 className="item-name">{item.itemName}</h3>

                    <div className="item-details">
                      <div className="detail-row">
                        <span className="detail-icon">📍</span>
                        <span>{item.location}</span>
                      </div>
                      {item.description && (
                        <div className="detail-row">
                          <span className="detail-icon">📝</span>
                          <span>{item.description}</span>
                        </div>
                      )}
                      {item.contact && (
                        <div className="detail-row">
                          <span className="detail-icon">📞</span>
                          <span>{item.contact}</span>
                        </div>
                      )}
                      {item.email && (
                        <div className="detail-row">
                          <span className="detail-icon">✉️</span>
                          <span>{item.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <p>Lost &amp; Found Portal — Built with React + MongoDB</p>
      </footer>

    </div>
  );
}

export default App;