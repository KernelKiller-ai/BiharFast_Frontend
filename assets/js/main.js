const form = document.getElementById('idea-request-form');
const statusMessage = document.getElementById('form-status');
const submitButton = document.getElementById('submit-button');
const whatsappButton = document.getElementById('whatsapp-button');

if (form && statusMessage && submitButton && whatsappButton) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const originalLabel = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.textContent = 'Bhej rahe hain…';
    statusMessage.className = 'form-status';
    statusMessage.textContent = '';

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: new FormData(form)
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Sujhav abhi nahi bheja ja saka. Thodi der baad dobara koshish karein.');
      }
      statusMessage.classList.add('is-success');
      statusMessage.textContent = 'Shukriya! Aapka sujhav mil gaya hai.';
      form.reset();
    } catch (error) {
      statusMessage.classList.add('is-error');
      statusMessage.textContent = error.message || 'Network mein dikkat hui. Apna internet check karke dobara koshish karein.';
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalLabel;
    }
  });

  whatsappButton.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const category = document.getElementById('category').value;
    const district = document.getElementById('district').value.trim();
    const idea = document.getElementById('idea').value.trim();
    const message = [
      'Namaste BiharFast! Mera ek sujhav hai:',
      '',
      `Category: ${category}`,
      district ? `Zila: ${district}` : '',
      `Idea / Problem: ${idea}`
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/916200554191?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  });
}

const menuToggle = document.querySelector('[data-menu-toggle]');
const primaryNav = document.querySelector('[data-primary-nav]');

if (menuToggle && primaryNav) {
  const setMenuOpen = (isOpen) => {
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Menu band karein' : 'Menu kholein');
    primaryNav.classList.toggle('is-open', isOpen);
  };

  menuToggle.addEventListener('click', () => {
    setMenuOpen(menuToggle.getAttribute('aria-expanded') !== 'true');
  });

  primaryNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!primaryNav.contains(event.target) && !menuToggle.contains(event.target)) setMenuOpen(false);
  });
}

document.querySelectorAll('[data-optional-image]').forEach((image) => {
  const imageFrame = image.closest('.brand-mark, .showcase-frame');
  const fallback = imageFrame?.querySelector('[data-image-fallback]');
  const showImage = () => {
    image.hidden = false;
    if (fallback) fallback.hidden = true;
  };
  const showFallback = () => {
    image.hidden = true;
    if (fallback) fallback.hidden = false;
  };

  image.addEventListener('load', showImage, { once: true });
  image.addEventListener('error', showFallback, { once: true });
  if (image.complete) image.naturalWidth ? showImage() : showFallback();
});
