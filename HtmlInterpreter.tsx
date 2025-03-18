import React, {
  HtmlHTMLAttributes,
  MouseEventHandler,
  MouseEvent,
  KeyboardEvent,
  FocusEvent,
  ReactNode,
  ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { RenderableHtmlNode, StorableHtmlNode } from "types/HtmlNodes";
import "styles/modal.css";
import "styles/textbox.css";
import { ActionType, useEditor } from "state/editor/EditorReducer";
import TrashIcon from "../../../assets/images/trash-icon.svg";
import CopyIcon from "../../../assets/images/copy-icon.svg";
import CodeIcon from "../../../assets/images/code-icon.svg";
import { useDragAndDropContext } from "state/dragAndDrop/DragAndDropReducer";
import { useDraggable } from "state/dragAndDrop/hooks/useDraggable";
import { useDroppable } from "state/dragAndDrop/hooks/useDroppable";
import { sectionFromId, storableNodeToHtmlObject } from "state/editor/Helpers";
import { MouseActionType, useMouse } from "state/mouse/MouseReducer";
import {
  useTextEditing,
  TextEditingActionType,
} from "state/textEditing/TextEditingReducer";
import ReactModal from "react-modal"; // Used to create a modal for viewing HTML code
import Prism from "prismjs"; // Used to highlight HTML code
import DOMPurify from "dompurify"; // Uses to sanitize HTML content and safeguard against XSS attacks
import "prismjs/themes/prism.css"; // Import the Prism CSS file
import { css_beautify, html_beautify } from "js-beautify";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

export type Props = {
  content: StorableHtmlNode[];
  root?: number;
  prefix: string;
};

export const HtmlInterpreter = (props: Props) => {
  const { state: editorState, dispatch: editorDispatch } = useEditor();
  const { state: mouseState, dispatch: mouseDispatch } = useMouse();
  const { state: textEditingState, dispatch: textEditingDispatch } =
    useTextEditing();
  const { dragState } = useDragAndDropContext();
  const { dragRef, startDrag } = useDraggable(
    storableNodeToHtmlObject(props.root ?? 0, {
      metadata: { type: "WIDGET" },
      html: { nodes: props.content },
    })
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ html: "", css: "" });

  // Add state for element dimensions
  const [elementWidth, setElementWidth] = useState(props.content[props.root ?? 0]?.attributes?.width?.value ? parseInt(props.content[props.root ?? 0].attributes.width.value) : 200);
  const [elementHeight, setElementHeight] = useState(props.content[props.root ?? 0]?.attributes?.height?.value ? parseInt(props.content[props.root ?? 0].attributes.height.value) : 100);

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const getFormattedCSS = (element: Element) => {
    let cssText = "";
    // Set to track and prevent the duplication of CSS rules (e.g., when child elements have the same rules as their parent)
    const addedRules = new Set();

    // Convert the StyleSheetList to an array for easier manipulation and iteration
    const styleSheets = Array.from(document.styleSheets);

    // Recursive function to process an element and its child elements
    const processElement = (elem: Element) => {
      // Retrieve inline styles directly from the element's "style" attribute
      const inlineStyles = elem.getAttribute("style");

      // If inline styles exist
      if (inlineStyles) {
        cssText += `\n${inlineStyles}\n\n`;
      }
      // Iterate over all stylesheets included or linked in the document
      styleSheets.forEach((sheet) => {
        try {
          // Convert CSSRuleList to an array and iterate over each rule
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              const ruleText = `${rule.selectorText} {\n  ${rule.style.cssText}\n}\n\n`;
              // Check if the element matches the rule's selector and the rule hasn't been added yet
              if (
                elem.matches(rule.selectorText) &&
                !addedRules.has(ruleText)
              ) {
                cssText += ruleText;
                // Add the rule text to the Set to avoid duplicates
                addedRules.add(ruleText);
              }
            }
          });
        } catch (e) {
          // Catch and warn about security errors when accessing styles from different origins
          console.warn(`Cannot access styles from ${sheet.href}:}`);
        }
      });
      // Recursively process all child elements of the current element
      Array.from(elem.children).forEach(processElement);
    };

    processElement(element);

    const formattedCSSText = css_beautify(cssText, {
      indent_size: 2,
      selector_separator_newline: true,
      newline_between_rules: true,
      space_around_selector_separator: true,
      space_around_combinator: true,
      end_with_newline: true,
    });

    // Use Prism to highlight the CSS text and return it
    return Prism.highlight(formattedCSSText, Prism.languages.css, "css");
  };

  const getFormattedHTML = (element: Element) => {
    // Remove the editor icons from the clone by selecting them via their classes
    element
      .querySelectorAll(".delete-icon, .copy-icon, .view-code-icon")
      .forEach((icon) => {
        icon.remove();
      });
    // Get the outer HTML of the cloned element
    const rawHtml = element.outerHTML;

    // Sanitize the raw HTML
    const cleanHtml = DOMPurify.sanitize(rawHtml);

    // Format the sanitized HTML
    const formattedHtmlString = html_beautify(cleanHtml, {
      indent_size: 2, // Two spaces for indentation
      indent_char: " ", // Using space instead of tab
      max_preserve_newlines: 1,
      preserve_newlines: true,
      indent_scripts: "keep", // "keep" keeps the script indent level equal to the tag that contains it
      end_with_newline: true,
      wrap_line_length: 80, // Standard line length for better readability
      indent_inner_html: true,
      unformatted: [], // Keep all elements formatted
    });

    // Return the highlighted HTML (using Prism)
    return Prism.highlight(formattedHtmlString, Prism.languages.html, "html");
  };

  const handleViewClick = (elementId: string) => {
    // Find the element and get its outer HTML
    const elem = document.getElementById(elementId);

    // Check if the element exists
    if (elem) {
      // Clone the element to avoid modifying the original element
      const cloneContainer = elem.cloneNode(true) as Element;
      const formattedHTML = getFormattedHTML(cloneContainer);
      const formattedCSS = getFormattedCSS(cloneContainer);
      if (formattedHTML && formattedCSS) {
        // Set the highlighted HTML and CSS to the modal content
        setModalContent({ html: formattedHTML, css: formattedCSS });

        // Open the modal
        setIsModalOpen(true);
      }
    }
  };

  const id = props.prefix + "-" + (props.root ?? 0).toString();

  const { dropRef, handleDrop, handleDragOver, handleDragOut } = useDroppable(
    // On drop callback
    (data) => {
      editorDispatch({
        type: ActionType.DROP,
        mouseState: mouseState,
        payload: data,
        targetId: id,
      });
    },
    // on Drag over callback
    (data) => {
      // Temporary -- still using some old logic from editor reducer
      editorDispatch({
        type: ActionType.DRAG_OVER,
        targetId: id,
        payload: data,
        mouseState: mouseState,
      });
    },
    // on Drag out callback
    () => {
      editorDispatch({ type: ActionType.DRAG_OUT, targetId: id });
    }
  );

  const handleDeleteClick = (elementId: string) => {
    // Dispatch a delete action
    editorDispatch({ type: ActionType.DELETE_ELEMENT, elementId });
  };

  const handleCopyClick = (elementId: string) => {
    // Dispatch a copy action
    editorDispatch({ type: ActionType.COPY_ELEMENT, elementId });
  };

  const parentRef = useRef(null);
  const refs: Array<React.MutableRefObject<HTMLDivElement | null>> = [];

  const content = props.content[props.root ?? 0];

  //iterate over the array of child elements and return that as content
  const Children = content.children?.map((child, i) => {
    return (
      <HtmlInterpreter
        key={i}
        prefix={props.prefix}
        content={props.content}
        root={child}
      />
    );
  });

  const elementOperations = (
    <div className="selected-element-ops">
      <img
        src={TrashIcon}
        alt="Delete Icon"
        title="Delete"
        className="icon delete-icon"
        onClick={() => {
          console.log("clicked!");
          handleDeleteClick(id);
        }}
      />

      <img
        src={CopyIcon}
        alt="Copy Icon"
        title="Copy"
        className="icon copy-icon"
        onClick={() => handleCopyClick(id)}
      />

      <img
        src={CodeIcon}
        alt="View Code"
        title="View"
        className="icon view-code-icon"
        onClick={() => handleViewClick(id)}
      />
    </div>
  );

  // const className:string = content.attributes["class"]
  let Element: ReactElement;

  let args: React.HTMLAttributes<HTMLElement> &
    React.ClassAttributes<HTMLElement> = {};

  let onClickCallbacks: Array<(e: MouseEvent) => void> = [];
  let mouseUpCallbacks: Array<(e: MouseEvent) => void> = [];
  let mouseDownCallbacks: Array<(e: MouseEvent) => void> = [];
  let mouseOverCallbacks: Array<(e: MouseEvent) => void> = [];
  let mouseOutCallbacks: Array<(e: MouseEvent) => void> = [];

  if (content.metadata?.selectable) {
    onClickCallbacks.push((e: MouseEvent) => {
      console.log(e.target, e.currentTarget);
      if (editorState.selectedElementId !== editorState.hoveredItemId) {
        e.stopPropagation();
        console.log("selecting", e.target);
        editorDispatch({
          type: ActionType.ELEMENT_SELECTED,
          selectedId: id,
        });
      }
    });

    // When the element is dragged over
    mouseOverCallbacks.push((e: MouseEvent) => {
      e.stopPropagation();
      editorDispatch({
        type: ActionType.HOVER,
        mouseState: mouseState,
        dragState: dragState,
        payload: id,
      });
    });

    // When the element is dragged out
    mouseOutCallbacks.push((e: MouseEvent) => {
      e.stopPropagation();
      editorDispatch({
        type: ActionType.UNHOVER,
        mouseState: mouseState,
        payload: id,
      });
    });
  }

  args.ref = parentRef;

  // register callbacks for draggable elements
  useEffect(() => {
    if (content.metadata?.draggable) {
      mouseDispatch({
        type: MouseActionType.REGISTER_CALLBACK,
        callback: (state, ev) => {
          // if left click is held and the target of the click is this draggable
          // element
          if (state.holdLeft && (ev.target as HTMLElement).id === id) {
            // initiate dragging of this element
            startDrag();
            editorDispatch({
              type: ActionType.START_DRAG,
              payload: id,
              dragRootId: id,
            });
          }
        },
        id: id,
      });
    }
    // Track and update on body, header, or footer changes since it can cause
    // cause the ids of elements to change as well
  }, [editorState.body, editorState.header, editorState.footer]);

  if (content.metadata?.draggable) {
    refs.push(dragRef);
  }

  if (content.metadata?.textbox) {
    args.onDoubleClick = (e: MouseEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.target as HTMLElement))
        return;

      let container = e.currentTarget as HTMLElement;
      let target = e.target as HTMLElement;

      editorDispatch({
        type: ActionType.ELEMENT_DOUBLE_CLICKED,
        containerId: container.id,
        elementId: target.id,
      });
      console.log(target);
    };
  }

  if (content.metadata?.editable) {
    args.suppressContentEditableWarning = true;

    args.onMouseDown = (e: MouseEvent) => {
      e.stopPropagation();
    };

    args.onBlur = (e: FocusEvent) => {
      console.log(content);
      editorDispatch({
        type: ActionType.ELEMENT_BLURRED,
        elementId: (e.currentTarget as HTMLElement).id,
      });
    };

    args.onKeyDown = (e: KeyboardEvent) => {
      const keys = ["Enter"];

      if (keys.includes(e.key)) {
      }
      e.preventDefault();

      textEditingDispatch({
        type: TextEditingActionType.TEXTBOX_KEYPRESS,
        editorState: editorState,
        key: e.key,
        elementId: editorState.selectedElementId ?? "",
      });
    };
  }

  if (content.metadata?.droppable) {
    // When the element has been dropped into
    mouseUpCallbacks.push((e: MouseEvent) => {
      if (editorState.hoveredItemId === e.currentTarget.id) {
        e.stopPropagation();
        handleDrop();
      }
    });

    // When the element is dragged over
    mouseOverCallbacks.push((e: MouseEvent) => {
      e.stopPropagation();
      handleDragOver();
    });

    // When the element is dragged out
    mouseOutCallbacks.push((e: MouseEvent) => {
      e.stopPropagation();
      handleDragOut();
    });

    refs.push(dropRef);
  }

  args.onMouseUp = (e: MouseEvent) => {
    mouseUpCallbacks.forEach((f) => {
      f(e);
    });
  };

  args.onClick = (e: MouseEvent) => {
    onClickCallbacks.forEach((f) => f(e));
  };

  args.onMouseOver = (e: MouseEvent) => {
    mouseOverCallbacks.forEach((f) => f(e));
  };

  args.onMouseLeave = (e: MouseEvent) => {
    mouseOutCallbacks.forEach((f) => f(e));
  };

  let children = content.attributes["text"]
    ? [content.attributes["text"].value, ...(Children ?? [])]
    : [...(Children ?? [])];

  if (editorState.selectedElementId === id) {
    children = [elementOperations, ...children];
  }

  const element = content.element;
  const outputAttributes = Object.keys(content.attributes).map((k) => {
    const attribute = content.attributes[k];
    return attribute.suppress ? null : k;
  });
  const outputAttributesObject: { [key: string]: string } = {};

  outputAttributes.forEach((a) => {
    if (a) {
      outputAttributesObject[a] = content.attributes[a].value;
    }
  });

  const outputStyles = Object.keys(content.style).map((k) => {
    const style = content.style[k];
    return style.suppress ? null : k;
  });
  const outputStyleObject: { [key: string]: string } = {};

  outputStyles.forEach((style) => {
    if (style) {
      outputStyleObject[style] = content.style[style].value;
    }
  });

  const finalArgs = {
    ...outputAttributesObject,
    id: id,
    style: outputStyleObject,
    ...args,
  };

  // Function to render the element with optional resize wrapper
  const renderElement = () => {
    const element = (
      <div
        id={id}
        ref={(el) => {
          if (dropRef.current) dropRef.current = el;
          if (dragRef.current) dragRef.current = el;
        }}
        style={{
          ...content.style,
          width: elementWidth ? `${elementWidth}px` : undefined,
          height: elementHeight ? `${elementHeight}px` : undefined,
        }}
        className={content.attributes?.["className"]?.value}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragOut}
      >
        {Children}
        {editorState.selectedElementId === id && elementOperations}
      </div>
    );

    // Only wrap in ResizableBox if the element is draggable/droppable
    if (content.metadata?.draggable || content.metadata?.droppable) {
      return (
        <ResizableBox
          width={elementWidth}
          height={elementHeight}
          minConstraints={[50, 50]}
          maxConstraints={[1000, 1000]}
          resizeHandles={['se']}
          onResize={(_e: React.SyntheticEvent, { size }: { size: { width: number; height: number } }) => {
            setElementWidth(size.width);
            setElementHeight(size.height);
            // Update the element's style directly
            if (content.style) {
              content.style.width = { value: `${size.width}px` };
              content.style.height = { value: `${size.height}px` };
            }
          }}
        >
          {element}
        </ResizableBox>
      );
    }

    return element;
  };

  useEffect(() => {
    refs.forEach((ref) => {
      ref.current = parentRef.current;
    });
  }, [parentRef]);

  /* React Modal for viewing HTML/CSS code of a element */
  const viewCodeModal = (
    <ReactModal
      isOpen={isModalOpen}
      onRequestClose={handleCloseModal}
      style={{
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          zIndex: 1000,
        },
        content: {
          position: "absolute",
          top: "20%",
          left: "20%",
          right: "20%",
          bottom: "20%",
          border: "4px solid #ccc",
          background: "#202020",
          overflow: "auto",
          borderRadius: "4px",
          outline: "none",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          resize: "both" /* Enables resizing */,
        },
      }}
    >
      {/* 'x' character used for closing the Modal */}
      <button className="modal-close-btn" onClick={handleCloseModal}>
        &times;
      </button>
      <div className="modal-container">
        <h3 className="html-modal-header">HTML</h3>
        <h3 className="css-modal-header">CSS</h3>
      </div>
      <div className="modal-code-container">
        {/* HTML Code */}
        <pre
          className="html-modal-code"
          dangerouslySetInnerHTML={{ __html: modalContent.html }}
        ></pre>

        {/* CSS Styles */}
        <pre
          className="css-modal-code"
          dangerouslySetInnerHTML={{ __html: modalContent.css }}
        ></pre>
      </div>
    </ReactModal>
  );

  return (
    <>
      {renderElement()}
      {viewCodeModal}
    </>
  );
};


//kinda workin HtmlInterpreter
import React, {
  HtmlHTMLAttributes,
  MouseEventHandler,
  KeyboardEvent,
  FocusEvent,
  ReactNode,
  ReactElement,
  useEffect,
  useRef,
  useState,
  JSX,
  CSSProperties,
} from "react";
import type { MouseEvent as ReactMouseEvent } from 'react';
import { RenderableHtmlNode, StorableHtmlNode } from "types/HtmlNodes";
import "styles/modal.css";
import "styles/textbox.css";
import { ActionType, useEditor } from "state/editor/EditorReducer";
import TrashIcon from "../../../assets/images/trash-icon.svg";
import CopyIcon from "../../../assets/images/copy-icon.svg";
import CodeIcon from "../../../assets/images/code-icon.svg";
import { useDragAndDropContext } from "state/dragAndDrop/DragAndDropReducer";
import { useDraggable } from "state/dragAndDrop/hooks/useDraggable";
import { useDroppable } from "state/dragAndDrop/hooks/useDroppable";
import { sectionFromId, storableNodeToHtmlObject } from "state/editor/Helpers";
import { MouseActionType, useMouse } from "state/mouse/MouseReducer";
import {
  useTextEditing,
  TextEditingActionType,
} from "state/textEditing/TextEditingReducer";
import ReactModal from "react-modal"; // Used to create a modal for viewing HTML code
import Prism from "prismjs"; // Used to highlight HTML code
import DOMPurify from "dompurify"; // Uses to sanitize HTML content and safeguard against XSS attacks
import "prismjs/themes/prism.css"; // Import the Prism CSS file
import { css_beautify, html_beautify } from "js-beautify";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

export type Props = {
  content: StorableHtmlNode[];
  root?: number;
  prefix: string;
  zIndexes: { [key: string]: number };
  bringToFront: (id: string) => void;
  maxZIndex: number;
};

interface ExtendedNodeMetadata {
  draggable?: boolean;
  selectable?: boolean;
  resizable?: boolean;
  type?: string;
  // ... other existing metadata properties
}

type ResizeHandleProps = {
  onResizeStart: (e: React.MouseEvent<HTMLDivElement>, direction: string) => void;
};

const ResizeHandles: React.FC<ResizeHandleProps> = ({ onResizeStart }) => {
  return (
    <div className="resize-handles-container">
      <div className="resize-handle nw" onMouseDown={(e) => onResizeStart(e, 'nw')} />
      <div className="resize-handle ne" onMouseDown={(e) => onResizeStart(e, 'ne')} />
      <div className="resize-handle sw" onMouseDown={(e) => onResizeStart(e, 'sw')} />
      <div className="resize-handle se" onMouseDown={(e) => onResizeStart(e, 'se')} />
    </div>
  );
};

interface ResizableWrapperProps {
  children: React.ReactNode;
  isSelected: boolean;
  onResizeStart: (e: React.MouseEvent<HTMLDivElement>, direction: string) => void;
  style?: React.CSSProperties;
  elementOperations?: React.ReactNode;
  refs?: Array<React.MutableRefObject<HTMLDivElement | null>>;
}

const ResizableWrapper: React.FC<ResizableWrapperProps> = ({
  children,
  isSelected,
  onResizeStart,
  style,
  elementOperations,
  refs
}) => {
  return (
    <div 
      className={`resizable-wrapper ${isSelected ? 'selected' : ''}`}
      style={style}
      ref={(el) => {
        if (el && refs) {
          refs.forEach(ref => {
            if (ref.current) ref.current = el;
          });
        }
      }}
    >
      {isSelected && elementOperations}
      {children}
      {isSelected && <ResizeHandles onResizeStart={onResizeStart} />}
    </div>
  );
};

export const HtmlInterpreter = (props: Props) => {
  const { state: editorState, dispatch: editorDispatch } = useEditor();
  const { state: mouseState, dispatch: mouseDispatch } = useMouse();
  const { state: textEditingState, dispatch: textEditingDispatch } =
    useTextEditing();
  const { dragState } = useDragAndDropContext();
  const { dragRef, startDrag } = useDraggable(
    storableNodeToHtmlObject(props.root ?? 0, {
      metadata: { type: "WIDGET" },
      html: { nodes: props.content },
    })
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ html: "", css: "" });

  // Add state for element dimensions
  const [elementWidth, setElementWidth] = useState(props.content[props.root ?? 0]?.attributes?.width?.value ? parseInt(props.content[props.root ?? 0].attributes.width.value) : 200);
  const [elementHeight, setElementHeight] = useState(props.content[props.root ?? 0]?.attributes?.height?.value ? parseInt(props.content[props.root ?? 0].attributes.height.value) : 100);

  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [initialSize, setInitialSize] = useState({ width: 0, height: 0 });
  const [resizeDirection, setResizeDirection] = useState('');

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const getFormattedCSS = (element: Element) => {
    let cssText = "";
    // Set to track and prevent the duplication of CSS rules (e.g., when child elements have the same rules as their parent)
    const addedRules = new Set();

    // Convert the StyleSheetList to an array for easier manipulation and iteration
    const styleSheets = Array.from(document.styleSheets);

    // Recursive function to process an element and its child elements
    const processElement = (elem: Element) => {
      // Retrieve inline styles directly from the element's "style" attribute
      const inlineStyles = elem.getAttribute("style");

      // If inline styles exist
      if (inlineStyles) {
        cssText += `\n${inlineStyles}\n\n`;
      }
      // Iterate over all stylesheets included or linked in the document
      styleSheets.forEach((sheet) => {
        try {
          // Convert CSSRuleList to an array and iterate over each rule
          Array.from(sheet.cssRules).forEach((rule) => {
            if (rule instanceof CSSStyleRule) {
              const ruleText = `${rule.selectorText} {\n  ${rule.style.cssText}\n}\n\n`;
              // Check if the element matches the rule's selector and the rule hasn't been added yet
              if (
                elem.matches(rule.selectorText) &&
                !addedRules.has(ruleText)
              ) {
                cssText += ruleText;
                // Add the rule text to the Set to avoid duplicates
                addedRules.add(ruleText);
              }
            }
          });
        } catch (e) {
          // Catch and warn about security errors when accessing styles from different origins
          console.warn(`Cannot access styles from ${sheet.href}:}`);
        }
      });
      // Recursively process all child elements of the current element
      Array.from(elem.children).forEach(processElement);
    };

    processElement(element);

    const formattedCSSText = css_beautify(cssText, {
      indent_size: 2,
      selector_separator_newline: true,
      newline_between_rules: true,
      space_around_selector_separator: true,
      space_around_combinator: true,
      end_with_newline: true,
    });

    // Use Prism to highlight the CSS text and return it
    return Prism.highlight(formattedCSSText, Prism.languages.css, "css");
  };

  const getFormattedHTML = (element: Element) => {
    // Remove the editor icons from the clone by selecting them via their classes
    element
      .querySelectorAll(".delete-icon, .copy-icon, .view-code-icon")
      .forEach((icon) => {
        icon.remove();
      });
    // Get the outer HTML of the cloned element
    const rawHtml = element.outerHTML;

    // Sanitize the raw HTML
    const cleanHtml = DOMPurify.sanitize(rawHtml);

    // Format the sanitized HTML
    const formattedHtmlString = html_beautify(cleanHtml, {
      indent_size: 2, // Two spaces for indentation
      indent_char: " ", // Using space instead of tab
      max_preserve_newlines: 1,
      preserve_newlines: true,
      indent_scripts: "keep", // "keep" keeps the script indent level equal to the tag that contains it
      end_with_newline: true,
      wrap_line_length: 80, // Standard line length for better readability
      indent_inner_html: true,
      unformatted: [], // Keep all elements formatted
    });

    // Return the highlighted HTML (using Prism)
    return Prism.highlight(formattedHtmlString, Prism.languages.html, "html");
  };

  const handleViewClick = (elementId: string) => {
    // Find the element and get its outer HTML
    const elem = document.getElementById(elementId);

    // Check if the element exists
    if (elem) {
      // Clone the element to avoid modifying the original element
      const cloneContainer = elem.cloneNode(true) as Element;
      const formattedHTML = getFormattedHTML(cloneContainer);
      const formattedCSS = getFormattedCSS(cloneContainer);
      if (formattedHTML && formattedCSS) {
        // Set the highlighted HTML and CSS to the modal content
        setModalContent({ html: formattedHTML, css: formattedCSS });

        // Open the modal
        setIsModalOpen(true);
      }
    }
  };

  const id = props.prefix + "-" + (props.root ?? 0).toString();

  const { dropRef, handleDrop, handleDragOver, handleDragOut } = useDroppable(
    // On drop callback
    (data) => {
      editorDispatch({
        type: ActionType.DROP,
        mouseState: mouseState,
        payload: data,
        targetId: id,
      });
    },
    // on Drag over callback
    (data) => {
      // Temporary -- still using some old logic from editor reducer
      editorDispatch({
        type: ActionType.DRAG_OVER,
        targetId: id,
        payload: data,
        mouseState: mouseState,
      });
    },
    // on Drag out callback
    () => {
      editorDispatch({ type: ActionType.DRAG_OUT, targetId: id });
    }
  );

  const handleDeleteClick = (elementId: string) => {
    // Dispatch a delete action
    editorDispatch({ type: ActionType.DELETE_ELEMENT, elementId });
  };

  const handleCopyClick = (elementId: string) => {
    // Dispatch a copy action
    editorDispatch({ type: ActionType.COPY_ELEMENT, elementId });
  };

  const parentRef = useRef(null);
  const refs: Array<React.MutableRefObject<HTMLDivElement | null>> = [];

  const content = props.content[props.root ?? 0];

  //iterate over the array of child elements and return that as content
  const Children = content.children?.map((child, i) => {
    return (
      <HtmlInterpreter
        key={i}
        prefix={props.prefix}
        content={props.content}
        root={child}
        zIndexes={props.zIndexes}
        bringToFront={props.bringToFront}
        maxZIndex={props.maxZIndex}
      />
    );
  });

  const elementOperations = (
    <div className="selected-element-ops">
      <img
        src={TrashIcon}
        alt="Delete Icon"
        title="Delete"
        className="icon delete-icon"
        onClick={() => {
          console.log("clicked!");
          handleDeleteClick(id);
        }}
      />

      <img
        src={CopyIcon}
        alt="Copy Icon"
        title="Copy"
        className="icon copy-icon"
        onClick={() => handleCopyClick(id)}
      />

      <img
        src={CodeIcon}
        alt="View Code"
        title="View"
        className="icon view-code-icon"
        onClick={() => handleViewClick(id)}
      />
    </div>
  );

  // const className:string = content.attributes["class"]
  let Element: ReactElement;

  let args: React.HTMLAttributes<HTMLElement> &
    React.ClassAttributes<HTMLElement> = {};

  let onClickCallbacks: Array<(e: ReactMouseEvent) => void> = [];
  let mouseUpCallbacks: Array<(e: ReactMouseEvent) => void> = [];
  let mouseDownCallbacks: Array<(e: ReactMouseEvent) => void> = [];
  let mouseOverCallbacks: Array<(e: ReactMouseEvent) => void> = [];
  let mouseOutCallbacks: Array<(e: ReactMouseEvent) => void> = [];

  if (content.metadata?.selectable) {
    onClickCallbacks.push((e: ReactMouseEvent) => {
      console.log(e.target, e.currentTarget);
      if (editorState.selectedElementId !== editorState.hoveredItemId) {
        e.stopPropagation();
        console.log("selecting", e.target);
        editorDispatch({
          type: ActionType.ELEMENT_SELECTED,
          selectedId: id,
        });
      }
    });

    // When the element is dragged over
    mouseOverCallbacks.push((e: ReactMouseEvent) => {
      e.stopPropagation();
      editorDispatch({
        type: ActionType.HOVER,
        mouseState: mouseState,
        dragState: dragState,
        payload: id,
      });
    });

    // When the element is dragged out
    mouseOutCallbacks.push((e: ReactMouseEvent) => {
      e.stopPropagation();
      editorDispatch({
        type: ActionType.UNHOVER,
        mouseState: mouseState,
        payload: id,
      });
    });
  }

  args.ref = parentRef;

  // register callbacks for draggable elements
  useEffect(() => {
    if (content.metadata?.draggable) {
      mouseDispatch({
        type: MouseActionType.REGISTER_CALLBACK,
        callback: (state, ev) => {
          // if left click is held and the target of the click is this draggable
          // element
          if (state.holdLeft && (ev.target as HTMLElement).id === id) {
            // initiate dragging of this element
            startDrag();
            editorDispatch({
              type: ActionType.START_DRAG,
              payload: id,
              dragRootId: id,
            });
          }
        },
        id: id,
      });
    }
    // Track and update on body, header, or footer changes since it can cause
    // cause the ids of elements to change as well
  }, [editorState.body, editorState.header, editorState.footer]);

  if (content.metadata?.draggable) {
    refs.push(dragRef);
  }

  if (content.metadata?.textbox) {
    args.onDoubleClick = (e: ReactMouseEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.target as HTMLElement))
        return;

      let container = e.currentTarget as HTMLElement;
      let target = e.target as HTMLElement;

      editorDispatch({
        type: ActionType.ELEMENT_DOUBLE_CLICKED,
        containerId: container.id,
        elementId: target.id,
      });
      console.log(target);
    };
  }

  if (content.metadata?.editable) {
    args.suppressContentEditableWarning = true;

    args.onMouseDown = (e: ReactMouseEvent) => {
      e.stopPropagation();
    };

    args.onBlur = (e: FocusEvent) => {
      console.log(content);
      editorDispatch({
        type: ActionType.ELEMENT_BLURRED,
        elementId: (e.currentTarget as HTMLElement).id,
      });
    };

    args.onKeyDown = (e: KeyboardEvent) => {
      const keys = ["Enter"];

      if (keys.includes(e.key)) {
      }
      e.preventDefault();

      textEditingDispatch({
        type: TextEditingActionType.TEXTBOX_KEYPRESS,
        editorState: editorState,
        key: e.key,
        elementId: editorState.selectedElementId ?? "",
      });
    };
  }

  if (content.metadata?.droppable) {
    // When the element has been dropped into
    mouseUpCallbacks.push((e: ReactMouseEvent) => {
      if (editorState.hoveredItemId === e.currentTarget.id) {
        e.stopPropagation();
        handleDrop();
      }
    });

    // When the element is dragged over
    mouseOverCallbacks.push((e: ReactMouseEvent) => {
      e.stopPropagation();
      handleDragOver();
    });

    // When the element is dragged out
    mouseOutCallbacks.push((e: ReactMouseEvent) => {
      e.stopPropagation();
      handleDragOut();
    });

    refs.push(dropRef);
  }

  args.onMouseUp = (e: ReactMouseEvent) => {
    mouseUpCallbacks.forEach((f) => {
      f(e);
    });
  };

  args.onClick = (e: ReactMouseEvent) => {
    onClickCallbacks.forEach((f) => f(e));
  };

  args.onMouseOver = (e: ReactMouseEvent) => {
    mouseOverCallbacks.forEach((f) => f(e));
  };

  args.onMouseLeave = (e: ReactMouseEvent) => {
    mouseOutCallbacks.forEach((f) => f(e));
  };

  let children = content.attributes["text"]
    ? [content.attributes["text"].value, ...(Children ?? [])]
    : [...(Children ?? [])];

  const element = content.element;
  const outputAttributes = Object.keys(content.attributes).map((k) => {
    const attribute = content.attributes[k];
    return attribute.suppress ? null : k;
  });
  const outputAttributesObject: { [key: string]: string } = {};

  outputAttributes.forEach((a) => {
    if (a) {
      outputAttributesObject[a] = content.attributes[a].value;
    }
  });

  const outputStyles = Object.keys(content.style).map((k) => {
    const style = content.style[k];
    return style.suppress ? null : k;
  });
  const outputStyleObject: { [key: string]: string } = {};

  outputStyles.forEach((style) => {
    if (style) {
      outputStyleObject[style] = content.style[style].value;
    }
  });

  const finalArgs = {
    ...outputAttributesObject,
    id: id,
    style: {
      ...outputStyleObject,
      position: (content.metadata as ExtendedNodeMetadata)?.draggable ? 'relative' : outputStyleObject.position,
      minHeight: content.element === 'div' ? '100px' : undefined,
      width: content.element === 'div' ? '100%' : outputStyleObject.width,
      zIndex: props.zIndexes[id] || 1,
    } as CSSProperties,
    ...args,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if (args.onClick) {
        args.onClick(e as React.MouseEvent<HTMLElement>);
      }
      // Bring the element to front when clicked
      props.bringToFront(id);
    }
  };

  // Create the base element with its content
  let baseElement: ReactElement;
  if (element === 'img') {
    baseElement = React.createElement('img', {
      ...finalArgs,
      src: content.attributes?.src?.value,
      alt: content.attributes?.alt?.value,
      style: {
        ...finalArgs.style,
        width: '100%',
        height: '100%',
        objectFit: 'contain'
      }
    });
  } else if (element === 'video' || element === 'iframe') {
    baseElement = React.createElement(element, {
      ...finalArgs,
      src: content.attributes?.src?.value,
      controls: element === 'video',
      style: {
        ...finalArgs.style,
        width: '100%',
        height: '100%'
      }
    });
  } else if (element === 'audio') {
    baseElement = React.createElement('audio', {
      ...finalArgs,
      src: content.attributes?.src?.value,
      controls: true,
      style: {
        ...finalArgs.style,
        width: '100%'
      }
    });
  } else {
    baseElement = children.filter((c) => c !== null).length > 0
      ? React.createElement(element, finalArgs, children)
      : React.createElement(element, finalArgs);
  }

  // Update the resizable container implementation
  if ((content.metadata as ExtendedNodeMetadata)?.resizable) {
    const width = parseInt(content.style?.width?.value || '300');
    const height = parseInt(content.style?.height?.value || '200');

    Element = (
      <ResizableBox
        width={width}
        height={height}
        minConstraints={[100, 100]}
        onResize={(_e: React.SyntheticEvent, { size }: { size: { width: number; height: number } }) => {
          editorDispatch({
            type: ActionType.RESIZE_WIDGET,
            elementId: id,
            width: `${size.width}px`,
            height: `${size.height}px`
          });
        }}
        resizeHandles={['se', 'sw', 'ne', 'nw']}
        handle={(handleAxis: string) => (
          <div className={`custom-handle custom-handle-${handleAxis}`}>
            <div className="handle-inner" />
          </div>
        )}
      >
        <div 
          className={`resizable-content ${editorState.selectedElementId === id ? 'selected' : ''}`}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            zIndex: props.zIndexes[id] || 1,
            boxSizing: 'border-box',
            margin: '8px',
            padding: '8px'
          }}
          {...args}
          ref={(el) => {
            if (el) {
              refs.forEach(ref => {
                if (ref.current) ref.current = el;
              });
            }
          }}
        >
          {editorState.selectedElementId === id && elementOperations}
          {baseElement}
        </div>
      </ResizableBox>
    );
  } else {
    Element = baseElement;
  }

  // Update CSS styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .editor-body-container {
        min-height: 600px;
        width: 100%;
        padding: 20px;
        background-color: #f8f9fa;
        border: 2px dashed #dee2e6;
        box-sizing: border-box;
      }
      .resizable-content {
        user-select: none;
        transition: transform 0.1s ease;
      }
      .resizable-content.selected {
        outline: 2px solid #4a90e2;
      }
      .custom-handle {
        position: absolute;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .handle-inner {
        width: 12px;
        height: 12px;
        background-color: #4a90e2;
        border: 2px solid white;
        border-radius: 50%;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .resizable-content:hover .handle-inner {
        opacity: 1;
      }
      .custom-handle-se { right: -10px; bottom: -10px; cursor: se-resize; }
      .custom-handle-sw { left: -10px; bottom: -10px; cursor: sw-resize; }
      .custom-handle-ne { right: -10px; top: -10px; cursor: ne-resize; }
      .custom-handle-nw { left: -10px; top: -10px; cursor: nw-resize; }
      .selected-element-ops {
        position: absolute;
        top: -30px;
        right: 0;
        display: flex;
        gap: 8px;
        z-index: 1001;
        background: white;
        padding: 4px;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .selected-element-ops .icon {
        width: 20px;
        height: 20px;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
      }
      .selected-element-ops .icon:hover {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  useEffect(() => {
    refs.forEach((ref) => {
      ref.current = parentRef.current;
    });
  }, [parentRef]);

  /* React Modal for viewing HTML/CSS code of a element */
  const viewCodeModal = (
    <ReactModal
      isOpen={isModalOpen}
      onRequestClose={handleCloseModal}
      style={{
        overlay: {
          backgroundColor: "rgba(0, 0, 0, 0.75)",
          zIndex: 1000,
        },
        content: {
          position: "absolute",
          top: "20%",
          left: "20%",
          right: "20%",
          bottom: "20%",
          border: "4px solid #ccc",
          background: "#202020",
          overflow: "auto",
          borderRadius: "4px",
          outline: "none",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          resize: "both" /* Enables resizing */,
        },
      }}
    >
      {/* 'x' character used for closing the Modal */}
      <button className="modal-close-btn" onClick={handleCloseModal}>
        &times;
      </button>
      <div className="modal-container">
        <h3 className="html-modal-header">HTML</h3>
        <h3 className="css-modal-header">CSS</h3>
      </div>
      <div className="modal-code-container">
        {/* HTML Code */}
        <pre
          className="html-modal-code"
          dangerouslySetInnerHTML={{ __html: modalContent.html }}
        ></pre>

        {/* CSS Styles */}
        <pre
          className="css-modal-code"
          dangerouslySetInnerHTML={{ __html: modalContent.css }}
        ></pre>
      </div>
    </ReactModal>
  );

  return (
    <>
      {Element}
      {viewCodeModal}
    </>
  );
};
