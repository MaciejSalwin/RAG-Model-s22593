import streamlit as st
import requests

DEFAULT_BACKEND = "http://backend:3001"

st.set_page_config(page_title="Q&A Model Maciej Salwin s22593", layout="wide")
st.title("Q&A Model Maciej Salwin s22593")


def clean_ws(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def upload_docs(base_url: str, uploaded_files):
    url = f"{base_url.rstrip('/')}/api/documents"
    files_payload = [("files", (file.name, file.getvalue(), "application/pdf")) for file in uploaded_files]
    response = requests.post(url, files=files_payload, timeout=600)
    response.raise_for_status()
    return response.json()


def ask_question(base_url: str, question: str, doc_id: str | None):
    url = f"{base_url.rstrip('/')}/api/question"
    payload = {"question": question}
    if doc_id:
        payload["docId"] = doc_id
    response = requests.post(url, json=payload, timeout=600)
    response.raise_for_status()
    return response.json()


def pick_docs(upload_response):
    files_list = upload_response.get("files") if isinstance(upload_response, dict) else []
    docs = []

    for file_info in files_list:
        if not isinstance(file_info, dict):
            continue
        doc_id = file_info.get("docId")
        if not doc_id:
            continue
        docs.append({
            "docId": str(doc_id),
            "filename": file_info.get("originalName") or "PDF",
        })

    return docs


if "backend_url" not in st.session_state:
    st.session_state.backend_url = DEFAULT_BACKEND
if "docs" not in st.session_state:
    st.session_state.docs = []
if "doc_id" not in st.session_state:
    st.session_state.doc_id = ""

with st.sidebar:
    st.header("Settings")
    st.session_state.backend_url = st.text_input("Backend URL", value=st.session_state.backend_url)

left_col, right_col = st.columns(2)

with left_col:
    st.subheader("Upload PDF")

    uploaded_files = st.file_uploader("Choose files", type=["pdf"], accept_multiple_files=True)

    if st.button("Upload", disabled=(not uploaded_files)):
        try:
            with st.spinner("Uploading"):
                upload_response = upload_docs(st.session_state.backend_url, uploaded_files)

            st.success("Done")
            st.json(upload_response)

            new_docs = pick_docs(upload_response)
            existing = {doc["docId"] for doc in st.session_state.docs}

            for doc in new_docs:
                if doc["docId"] not in existing:
                    st.session_state.docs.append(doc)
                    existing.add(doc["docId"])

            if not clean_ws(st.session_state.doc_id) and new_docs:
                st.session_state.doc_id = new_docs[0]["docId"]

            st.rerun()

        except requests.HTTPError as error:
            st.error("Request failed")
            st.code(error.response.text)
        except Exception:
            st.error("Upload failed")

    st.subheader("Docs")
    if not st.session_state.docs:
        st.info("No docs")
    else:
        for index, doc in enumerate(st.session_state.docs):
            st.write(f"{index+1}. {doc.get('filename')}")

with right_col:
    st.subheader("Ask")

    selected_doc_id = ""
    if st.session_state.docs:
        labels = ["none"] + [f"{d['filename']} {d['docId']}" for d in st.session_state.docs]
        selected = st.selectbox("Pick doc", options=labels, index=0)
        if selected != "none":
            selected_doc_id = selected.split()[-1]

    st.session_state.doc_id = st.text_input("DocId", value=st.session_state.doc_id)
    effective_doc_id = clean_ws(st.session_state.doc_id) or clean_ws(selected_doc_id)

    question_text = st.text_area("Question", height=120)

    if st.button("Ask", disabled=(not question_text.strip())):
        try:
            with st.spinner("Asking"):
                result = ask_question(
                    st.session_state.backend_url,
                    question_text.strip(),
                    effective_doc_id or None
                )

            st.success("Done")
            st.subheader("Answer")
            st.write(result.get("answer") or "")

            st.subheader("Sources")
            sources = result.get("sources") or []
            if not sources:
                st.info("No sources")
            else:
                for source in sources:
                    sid = source.get("id")
                    name = source.get("filename")
                    page = source.get("page")
                    with st.expander(f"{sid} {name} page {page}"):
                        st.json(source)

            st.subheader("JSON")
            st.json(result)

        except requests.HTTPError as error:
            st.error("Request failed")
            st.code(error.response.text)
        except Exception:
            st.error("Ask failed")
